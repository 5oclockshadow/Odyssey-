"""Direct unit tests for the workbench modules that the integration tests
otherwise only exercise indirectly: skills, agent_base, agent_tools, core,
settings, events, and the v0.1 graph_viz renderer."""

import asyncio
import threading

import pytest

from selfwire.graph_viz import render_graph_html
from selfwire.workbench.agent_base import MAX_OBSERVATION_CHARS, WorkbenchAgent
from selfwire.workbench.agent_tools import ToolRefused, WorkbenchToolkit
from selfwire.workbench.auditor import Auditor
from selfwire.workbench.core import PACKAGE_UI, WORKSPACE_UI_REL
from selfwire.workbench.events import EventBus
from selfwire.workbench.settings import LMNotConfigured, WorkbenchSettings
from selfwire.workbench.skills import SkillError, SkillStore, parse_frontmatter
from selfwire.workbench.workspace import Workspace


# -- skills ------------------------------------------------------------------------
def test_frontmatter_parsing():
    assert parse_frontmatter("---\nname: a\ndescription: 'does b: c'\n---\nbody") == {"name": "a", "description": "does b: c"}
    assert parse_frontmatter("no frontmatter") == {}
    assert parse_frontmatter("---\nunterminated") == {}


def test_skill_store_roundtrip(mini_repo):
    ws = Workspace(mini_repo)
    store = SkillStore(ws)
    saved = store.put("triage", "Plain body without frontmatter")
    assert saved.content.startswith("---\nname: triage\n") and "Plain body" in saved.content
    store.put("deploy", "---\nname: deploy\ndescription: ship it\n---\nsteps")
    assert [(s.name, s.description) for s in store.list()] == [("deploy", "ship it"), ("triage", "")]
    assert "deploy: ship it" in store.context_block()
    for bad in ("Bad", "../up", "", "a" * 70):
        with pytest.raises(SkillError):
            store.put(bad, "x")
    with pytest.raises(SkillError):
        store.put("empty", "   ")
    store.delete("triage")
    with pytest.raises(FileNotFoundError):
        store.get("triage")
    assert SkillStore(Workspace(mini_repo), dirname="nothing-here").context_block() == "SKILLS: (none)"


# -- settings / events -----------------------------------------------------------------
def test_settings_never_expose_the_key_and_validate(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    settings = WorkbenchSettings()
    assert not settings.configured()
    with pytest.raises(LMNotConfigured):
        settings.build_lm()
    settings.update(model="openai/gpt-4o-mini")
    assert settings.configured() and not settings.has_key()
    monkeypatch.setenv("OPENAI_API_KEY", "from-env")
    assert settings.has_key(), "a provider key litellm reads from the environment counts"
    settings.update(api_key="sk-live")
    lm = settings.build_lm()
    assert settings.build_lm() is lm, "same config reuses the LM"
    assert "sk-live" not in str(settings.public())
    with pytest.raises(ValueError):
        settings.update(max_iters=0)


def test_event_bus_bridges_threads_to_asyncio():
    bus = EventBus(history=3)
    seen = []
    bus.add_listener(lambda e: seen.append(e.type))
    bus.add_listener(lambda e: 1 / 0)  # a broken listener must not break publishing

    async def consume():
        sub = bus.subscribe()
        threading.Thread(target=lambda: [bus.publish("t", {"i": i}) for i in range(5)]).start()
        got = [await sub.get(timeout=2) for _ in range(5)]
        sub.close()
        return got

    events = asyncio.run(consume())
    assert [e.data["i"] for e in events] == [0, 1, 2, 3, 4]
    assert seen == ["t"] * 5 and len(bus.history()) == 3 and bus.subscriber_count == 0


# -- agent_base / agent_tools / core -------------------------------------------------------
def test_agent_context_shows_signatures_and_clips_observations(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    agent = wb.agent()
    assert isinstance(agent, WorkbenchAgent)
    steps = [{"iteration": i, "action_type": "call_tool", "tool_name": "read_file", "observation": "x" * 5000}
             for i in range(20)]
    context = agent._build_context("do things", steps)
    assert "read_file(path: string, start_line: integer, end_line: integer)" in context
    assert "earlier step(s) omitted" in context
    assert f"clipped {5000 - MAX_OBSERVATION_CHARS} chars" in context
    assert context.count("[") < 5000, "observations are clipped, not inlined whole"


def test_toolkit_read_ranges_and_improve_guard(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    kit = WorkbenchToolkit(wb)
    text = kit.read_file("calc/__init__.py", start_line=4, end_line=5)
    assert text.splitlines()[1:] == ["4| def add(a, b):", "5|     return a + b"]
    assert kit.list_files("calc/") == ["calc/__init__.py"]
    gate = threading.Event()
    job = wb.jobs.submit("improve", "holding", lambda ctx: gate.wait(10), group="workspace")
    try:
        with pytest.raises(ToolRefused, match="improvement job"):
            kit.write_file("x.py", "x")
        with pytest.raises(ToolRefused):
            kit.git_commit("nope")
    finally:
        gate.set()
        wb.jobs.wait(job.id)
    with pytest.raises(ToolRefused, match="run the full suite first"):
        kit.git_commit("untested")


def test_core_ui_path_and_inline_tests(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    assert wb.ui_path() == PACKAGE_UI and PACKAGE_UI.is_file()
    wb.workspace.write(WORKSPACE_UI_REL, "<html>live</html>")
    assert wb.ui_path() == wb.root / WORKSPACE_UI_REL
    report = wb.run_tests_inline()
    assert report.ok and wb.last_test_report is report
    assert wb.jobs.list(1)[0].kind == "tests" and wb.jobs.list(1)[0].status == "succeeded"
    assert (wb.root / ".selfwire" / "reports").is_dir()


def test_auditor_credits_prefixed_test_file_names(make_repo):
    ws = Workspace(make_repo({"app/__init__.py": "", "app/chat.py": "X = 1\n", "tests/test_feature_chat.py": "def test_x():\n    pass\n"}))
    ws.ensure_repo()
    assert not [f for f in Auditor(ws).run().findings if f.rule == "untested-module"]


# -- graph_viz (v0.1 module) ----------------------------------------------------------------
def test_render_graph_html_embeds_the_graph(graph, tmp_path):
    graph.ensure_node("alpha", source="native")
    graph.ensure_node("beta", source="mcp:tiny")
    graph.record_use("ep", "alpha", source="native")
    graph.record_use("ep", "beta", source="mcp:tiny")
    out = render_graph_html(graph, out_path=str(tmp_path / "g.html"), title="Unit graph")
    html = out.read_text()
    assert out == tmp_path / "g.html"
    assert "Unit graph" in html and '"alpha"' in html and '"beta"' in html and "<canvas" in html

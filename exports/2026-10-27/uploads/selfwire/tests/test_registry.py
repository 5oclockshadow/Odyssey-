"""registry.py — the mutable tool catalog: register/unregister, duplicate
protection, dspy.Tool export, and tracked invocation (success + error paths)."""

import functools

import dspy
import pytest

from selfwire.registry import ToolRegistry, ToolRegistryError


def add(a: int, b: int) -> int:
    """Add two integers."""
    return a + b


def boom() -> None:
    raise RuntimeError("boom")


def test_register_and_get(registry):
    record = registry.register(add)
    assert record.name == "add"
    assert record.source == "native"
    assert registry.get("add") is record
    assert "add" in registry


def test_register_uses_docstring_as_default_description(registry):
    record = registry.register(add)
    assert "Add two integers" in record.description


def test_register_duplicate_without_overwrite_raises(registry):
    registry.register(add)
    with pytest.raises(ToolRegistryError):
        registry.register(add)


def test_register_duplicate_with_overwrite_bumps_version(registry):
    r1 = registry.register(add)
    r2 = registry.register(add, overwrite=True)
    assert r2.version == r1.version + 1


def test_register_without_name_and_no_dunder_name_raises(registry):
    # functools.partial objects have no __name__ at all (unlike lambdas,
    # which do have one: '<lambda>') -> this is the real "needs an explicit
    # name" case.
    nameless = functools.partial(add, a=1)
    with pytest.raises(ToolRegistryError):
        registry.register(nameless, name=None)


def test_unregister(registry):
    registry.register(add)
    assert registry.unregister("add") is True
    assert "add" not in registry
    assert registry.unregister("add") is False  # already gone


def test_as_dspy_tools_returns_dspy_tool_instances(registry):
    registry.register(add)
    tools = registry.as_dspy_tools()
    assert len(tools) == 1
    assert isinstance(tools[0], dspy.Tool)
    assert tools[0].name == "add"


def test_call_tracks_success(registry):
    registry.register(add)
    result = registry.call("add", episode_id="ep1", a=2, b=3)
    assert result == 5
    record = registry.get("add")
    assert record.call_count == 1
    assert record.error_count == 0


def test_call_tracks_errors_and_reraises(registry):
    registry.register(boom)
    with pytest.raises(RuntimeError):
        registry.call("boom", episode_id="ep1")
    record = registry.get("boom")
    assert record.error_count == 1
    assert record.call_count == 0


def test_call_unknown_tool_raises_registry_error(registry):
    with pytest.raises(ToolRegistryError):
        registry.call("does-not-exist", episode_id="ep1")


def test_call_records_use_on_the_graph(registry, graph):
    registry.register(add)
    registry.call("add", episode_id="ep1", a=1, b=1)
    assert graph.g.nodes["add"]["calls"] == 1


def test_stats_reports_all_tools(registry):
    registry.register(add)
    registry.register(boom)
    stats = registry.stats()
    assert set(stats.keys()) == {"add", "boom"}
    assert stats["add"]["source"] == "native"


def test_names_is_sorted(registry):
    registry.register(boom)
    registry.register(add)
    assert registry.names() == ["add", "boom"]

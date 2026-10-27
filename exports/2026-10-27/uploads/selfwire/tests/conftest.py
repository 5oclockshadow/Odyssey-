import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from selfwire.storage import RaptorRedisStore
from selfwire.graph_store import ToolGraph
from selfwire.registry import ToolRegistry
from selfwire.exec_tool import ExecTool
from selfwire.mcp_hub import McpHub
from selfwire.own_server import OwnServer
from selfwire.telemetry import Telemetry
from selfwire.reporter import Reporter

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
TINY_MCP_SERVER = FIXTURES_DIR / "tiny_mcp_server.py"

# a tiny, fast, self-contained repo the workbench tests serve, test, audit,
# and improve — never the selfwire repo itself
MINI_FILES = {
    "calc/__init__.py": '"""calc."""\n\n\ndef add(a, b):\n    return a + b\n',
    "tests/test_calc.py": "from calc import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n",
}


@pytest.fixture
def make_repo(tmp_path):
    def _make(files=None, name="repo"):
        root = tmp_path / name
        root.mkdir(parents=True, exist_ok=True)
        for rel, content in (MINI_FILES if files is None else files).items():
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        return root

    return _make


@pytest.fixture
def mini_repo(make_repo):
    return make_repo()


@pytest.fixture
def workbench_factory():
    created = []

    def _make(root, **kwargs):
        from selfwire.workbench import Workbench

        wb = Workbench(root, **kwargs)
        created.append(wb)
        return wb

    yield _make
    for wb in created:
        wb.close()


@pytest.fixture
def store(tmp_path):
    return RaptorRedisStore(namespace="test", file_root=tmp_path / "kv", connect_timeout=0.2)


@pytest.fixture
def graph(store):
    return ToolGraph(store=store, key="test_graph")


@pytest.fixture
def registry(graph):
    return ToolRegistry(graph=graph)


@pytest.fixture
def exec_tool(registry):
    return ExecTool(registry)


@pytest.fixture
def mcp_hub(registry):
    hub = McpHub(registry)
    yield hub
    hub.shutdown()


@pytest.fixture
def own_server(registry, exec_tool):
    return OwnServer(registry, exec_tool=exec_tool, name="test-server")


@pytest.fixture
def telemetry(tmp_path):
    return Telemetry(log_dir=tmp_path / "telemetry", enable_phoenix=False)


@pytest.fixture
def reporter(tmp_path):
    return Reporter(reports_dir=tmp_path / "reports")


@pytest.fixture
def agent(registry, mcp_hub, own_server, exec_tool, graph, telemetry, reporter):
    from selfwire.agent import SelfWireAgent

    return SelfWireAgent(
        registry=registry, mcp_hub=mcp_hub, own_server=own_server, exec_tool=exec_tool,
        graph=graph, telemetry=telemetry, reporter=reporter, max_iters=5,
    )

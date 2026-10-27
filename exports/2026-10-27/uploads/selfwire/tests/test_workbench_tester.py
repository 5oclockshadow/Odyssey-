import threading
import time

import pytest

from selfwire.workbench.tester import TestRunner, TestRunnerError

MIXED = {
    "pkg/__init__.py": "",
    "tests/test_mixed.py": (
        "import pytest\n\n"
        "def test_ok():\n    assert True\n\n"
        "def test_bad():\n    assert 1 == 2, 'one is not two'\n\n"
        "@pytest.mark.skip(reason='later')\ndef test_skipped():\n    pass\n\n"
        "class TestGroup:\n    def test_in_class(self):\n        raise ValueError('boom')\n"
    ),
}


def test_counts_and_exact_node_ids(make_repo):
    report = TestRunner(make_repo(MIXED)).run()
    assert not report.ok and report.exit_code == 1
    assert (report.total, report.passed, report.failed, report.skipped, report.errors) == (4, 1, 2, 1, 0)
    ids = {f.nodeid for f in report.failures}
    assert ids == {"tests/test_mixed.py::test_bad", "tests/test_mixed.py::TestGroup::test_in_class"}
    bad = next(f for f in report.failures if f.nodeid.endswith("test_bad"))
    assert "one is not two" in bad.message or "one is not two" in bad.text


def test_green_run_streams_lines(mini_repo):
    lines = []
    report = TestRunner(mini_repo).run(on_line=lines.append)
    assert report.ok and report.passed == 1 and report.full_run
    assert any("passed" in line for line in lines)
    assert "passed" in report.output_tail


def test_selector_and_keyword(make_repo):
    root = make_repo(MIXED)
    runner = TestRunner(root)
    only_ok = runner.run("tests/test_mixed.py::test_ok")
    assert only_ok.ok and only_ok.total == 1 and not only_ok.full_run
    by_kw = runner.run(keyword="in_class")
    assert by_kw.failed == 1 and by_kw.keyword == "in_class"


@pytest.mark.parametrize("selector", ["--co", "-x", "../outside", "/abs/path", "missing_dir/test_x.py"])
def test_selector_injection_and_escape_rejected(mini_repo, selector):
    with pytest.raises(TestRunnerError):
        TestRunner(mini_repo).run(selector)


@pytest.mark.parametrize("keyword", ["-p evil", "a\nb", "x" * 301])
def test_keyword_rejected(mini_repo, keyword):
    with pytest.raises(TestRunnerError):
        TestRunner(mini_repo).run(keyword=keyword)


def test_collection_error_is_not_ok(make_repo):
    root = make_repo({"tests/test_broken.py": "def test_x(:\n    pass\n"})
    report = TestRunner(root).run()
    assert not report.ok and report.errors >= 1


def test_stale_bytecode_cannot_make_broken_code_pass(mini_repo):
    """Regression: a same-length edit within the same second as an earlier
    import used to run the old cached .pyc, so broken code tested green."""
    import subprocess
    import sys

    env = {k: v for k, v in __import__("os").environ.items() if k not in ("PYTHONDONTWRITEBYTECODE", "PYTHONPYCACHEPREFIX")}
    subprocess.run([sys.executable, "-c", "import calc"], cwd=mini_repo, env=env, check=True)
    assert list((mini_repo / "calc" / "__pycache__").glob("*.pyc")), "precondition: a warm bytecode cache exists"
    src = mini_repo / "calc" / "__init__.py"
    src.write_text(src.read_text().replace("return a + b", "return a - b"))  # identical byte length
    report = TestRunner(mini_repo).run()
    assert not report.ok and report.failed == 1


def test_no_tests_is_not_ok(make_repo):
    report = TestRunner(make_repo({"pkg/__init__.py": ""})).run()
    assert not report.ok and report.total == 0


SLOW = {"tests/test_slow.py": "import time\n\ndef test_sleep():\n    time.sleep(30)\n"}


def test_cancel_kills_the_run_fast(make_repo):
    cancel = threading.Event()
    threading.Timer(1.0, cancel.set).start()
    started = time.time()
    report = TestRunner(make_repo(SLOW)).run(cancel_event=cancel)
    assert report.cancelled and not report.ok
    assert time.time() - started < 15


def test_timeout_kills_the_run(make_repo):
    report = TestRunner(make_repo(SLOW), timeout=1.5).run()
    assert report.timed_out and not report.ok
    assert "timeout" in report.output_tail

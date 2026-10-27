from selfwire.workbench.auditor import Auditor
from selfwire.workbench.tester import TestRunner
from selfwire.workbench.workspace import Workspace

MARK = "TO" + "DO"  # built so this test file itself never trips the scanner


def _audit(make_repo, files, report=None):
    ws = Workspace(make_repo(files))
    ws.ensure_repo()
    return Auditor(ws).run(report), ws


def rules(audit):
    return {(f.rule, f.path) for f in audit.findings}


def test_clean_repo_scores_100_after_green_run(make_repo, mini_repo):
    ws = Workspace(mini_repo)
    ws.ensure_repo()
    report = TestRunner(mini_repo).run()
    audit = Auditor(ws).run(report)
    assert audit.score == 100 and audit.findings == []
    assert audit.metrics["py_files"] == 2 and audit.metrics["packages"] == ["calc"]


def test_detects_each_rule(make_repo):
    long_body = "\n".join(f"    x{i} = {i}" for i in range(90))
    files = {
        "app/__init__.py": "",
        "app/broken.py": "def f(:\n",
        "app/stub.py": f"# {MARK}: finish this\ndef g():\n    raise NotImplementedError\n",
        "app/catchall.py": "try:\n    pass\nexcept:\n    pass\n",
        "app/longfn.py": f"def long():\n{long_body}\n",
        "app/lonely.py": "VALUE = 1\n",
        "tests/test_stub.py": "from app import stub, catchall, longfn, broken\n",
    }
    audit, _ = _audit(make_repo, files)
    found = rules(audit)
    assert ("syntax-error", "app/broken.py") in found
    assert ("placeholder", "app/stub.py") in found
    assert ("bare-except", "app/catchall.py") in found
    assert ("long-function", "app/longfn.py") in found
    assert ("untested-module", "app/lonely.py") in found
    assert ("tests-not-run", None) in found
    assert sum(1 for f in audit.findings if f.rule == "placeholder") == 2  # comment marker + NotImplementedError
    severities = [f.severity for f in audit.findings]
    assert severities == sorted(severities, key=["high", "medium", "low", "info"].index)
    assert audit.plan[0].title.startswith("Fix the syntax error")
    assert audit.score < 100


def test_marker_inside_a_string_is_not_a_finding(make_repo):
    files = {"app/__init__.py": f'MSG = "{MARK} list app"\n', "tests/test_app.py": "import app\n"}
    audit, _ = _audit(make_repo, files)
    assert not [f for f in audit.findings if f.rule == "placeholder"]


def test_import_error_is_high_severity(make_repo):
    files = {"app/__init__.py": "import does_not_exist_anywhere\n", "tests/test_app.py": "import app\n"}
    audit, _ = _audit(make_repo, files)
    assert any(f.rule == "import-error" and f.severity == "high" for f in audit.findings)


def test_failing_tests_are_a_high_finding(make_repo):
    root = make_repo({"calc/__init__.py": "def add(a, b):\n    return a - b\n",
                      "tests/test_calc.py": "from calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n"})
    ws = Workspace(root)
    ws.ensure_repo()
    audit = Auditor(ws).run(TestRunner(root).run())
    assert any(f.rule == "tests-failing" and "test_add" in f.message for f in audit.findings)
    assert audit.counts()["high"] == 1

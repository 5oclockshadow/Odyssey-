"""reporter.py — the README execution log and the HTML historical-context
report, including reading a *previous* run's report back in to preserve
continuity across runs (the actual point of the HTML report)."""

from selfwire.reporter import Reporter


def test_append_log_creates_and_appends(reporter):
    reporter.append_log("first step", "details here")
    text = reporter.log_path.read_text()
    assert "first step" in text
    assert "details here" in text
    reporter.append_log("second step")
    text = reporter.log_path.read_text()
    assert "first step" in text and "second step" in text  # append, not overwrite


def test_read_latest_context_report_returns_none_when_nothing_written_yet(reporter):
    assert reporter.read_latest_context_report() is None


def test_write_and_read_back_context_report_round_trip(reporter):
    state = {"tools": [{"name": "add", "source": "native", "call_count": 3, "error_count": 0}], "run_note": "hi"}
    path = reporter.write_context_report("run123", "3 tools active", state)
    assert path.exists()
    assert path.name.startswith("context-")
    assert path.suffix == ".html"

    ingested = reporter.read_latest_context_report()
    assert ingested is not None
    assert ingested["run_note"] == "hi"
    assert ingested["tools"][0]["name"] == "add"
    assert ingested["_source_file"] == str(path)


def test_read_latest_context_report_picks_the_most_recent_one(reporter):
    reporter.write_context_report("run1", "first", {"marker": "first"})
    import time

    time.sleep(1.1)  # filenames are second-granularity timestamps; ensure ordering
    reporter.write_context_report("run2", "second", {"marker": "second"})
    latest = reporter.read_latest_context_report()
    assert latest["marker"] == "second"


def test_context_report_html_escapes_summary(reporter):
    path = reporter.write_context_report("runX", "<script>alert(1)</script>", {"tools": []})
    text = path.read_text()
    assert "<script>alert(1)</script>" not in text
    assert "&lt;script&gt;" in text


def test_context_report_is_neon_dark_mode(reporter):
    path = reporter.write_context_report("runY", "styling check", {"tools": []})
    text = path.read_text()
    assert "--neon" in text
    assert "#0a0e14" in text or "background" in text

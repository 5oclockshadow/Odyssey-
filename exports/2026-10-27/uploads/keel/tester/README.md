# The Tester

Working now:
- `scan_code`: static SOC 2 scan (hardcoded secrets, TLS verification off, plaintext HTTP, dynamic exec, unsafe pickle, shell=True, cookie review).
- `apply_fix`: one exact-match replacement on a `tester/<id>` branch. Kept and committed only if pytest exits 0, the build compiles, and the finding count drops. Otherwise the branch is deleted.
- `cycle`: scan, then attempt the mechanical fixes (TLS verify, shell=True). Other findings are marked `needs_review`.
- `run_tests`, `build_check`, `propose_patch` (manual proposals with an approval gate).

Gating: with no tests in the repo, nothing auto-applies. Auto-applied fixes stay on their branch until merged by hand.

Not yet wired: DSPy ReAct loop, `rm` retriever, Redis-RAPTOR tree indexing (planned on the RAPTOR approach, MIT, github.com/parthsarthi03/raptor), fuzzing and race/memory chaos routines, Super Duper Recorder, self-improvement loops. The dashboard still shows sample data.

Run:

    export TESTER_APPROVER_TOKEN=$(openssl rand -hex 24)
    REPO_PATH=/path/to/repo docker compose up --build

MCP endpoint: `POST /mcp` (JSON-RPC `tools/list`, `tools/call`).

---
name: ingest-and-locate
intro: Give Codegen any local path, zip, git repo or URL and it ingests it into the one graph; then anyone can ask "where is the code for X" or "where is that piece of UI" and get the file, the lines, and a screenshot of both the code and the rendered UI.
---
# Ingest anything, then locate code and UI by sight

## Ingest (one entry point)
`POST /api/v3/ingest {"source": "<path | file.zip | git URL | https URL>", "project": "<name>", "tags": [...]}` and `cg ingest <source> --project <name>`.
- Local folder: index in place (no copy). Zip: extract into a new empty dir under /output/sources/<project>/<sha8>/ (untrusted data; never execute it). Git URL: shallow clone (or use the R720 mirror when it has the repo). https URL: fetch with httpx; save the response and its sha256; HTML pages are rendered and screenshotted too.
- Remote hosts: `ssh -F /src/state/ssh/config r720 ...` read-only (rsync or git archive to the workspace, or index over ssh).
- Every file becomes a node: path, project, language, size, sha256, mtime, symbols (AST for py/js/ts; headings for md; elements/components for .html/.dc.html), and edges (imports, calls, defines, renders, styles, same-content-as). Identical content anywhere on the fleet = one content node linked to every location (dedupe).
- Re-ingest is incremental by mtime + sha; weights survive.

## Locate (code and UI)
`GET /api/v3/locate?q=<words or code or description>` and `cg locate "<query>"`:
1. Search symbols, text (regex/grep), and RAPTOR summaries; rank with Hebbian weight.
2. For each top hit return: project, path, line range, a code snippet, and **two screenshots**: the code (syntax-highlighted render of the lines) and, for UI files, the rendered UI with the matching element outlined (Playwright, 1440 and 390 px).
3. Reverse lookup: upload/paste a UI screenshot or describe the UI ("the dark sidebar with the 14 skill chips") → find the component that renders it (DOM text + class names + visual similarity of stored screenshots).
- UI: a **Locate** panel: search box, result cards with code shot + UI shot side by side, "open in editor", "show in connectome".
- Cache screenshots as files with sha256; never show a screenshot that wasn't produced from the current file hash (flag it stale otherwise).

## Rules
- Ingest is read-only on the source. Never modify or execute ingested code during ingest.
- Outputs-must-exist applies: an ingest reports files indexed, nodes/edges added, screenshots written, with counts that match the store.
- Don't print secrets found in ingested files; flag them (flags system) with path + line, value masked.

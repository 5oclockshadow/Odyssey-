---
name: ai-coded-project-review
intro: Review and repair projects written by Claude, Gemini or Qwen — the failure patterns model-written code has, and how to prove each with Gopher's skills instead of eyeballing.
---
# Reviewing AI-coded projects (Claude · Gemini · Qwen)

Check, in this order, and prove each with a skill (lint / search / read_file / sha256):
1. **Truncation**: files that end mid-string/mid-block, unclosed code fences, `...` placeholders → `lint` every file.
2. **Invented APIs**: imports or methods that don't exist in the pinned versions → `search` the import, read the lib.
3. **Version sprawl**: v1/v2/v3/_final/_new copies of the same module; only one is imported → `search` importers, keep one.
4. **Dead wiring**: routes/plugins/skills defined but never called (our 38 inert skills) → search callers of each.
5. **Placeholders**: TODO/FIXME/"implement here"/mock data presented as real → `search "TODO|FIXME|placeholder|mock"`.
6. **Tests that test nothing**: asserts on status 200 only, or on the mock itself → read the tests, add one real check.
7. **Secrets & paths**: keys in code, absolute paths of the author's machine → `search "sk-|api_key|/home/"`.
8. **Config drift**: ports/URLs that point at another service (our :9902 vs :9913) → compare compose, env, code defaults.
**Output**: `write_report` with a table `file:line · pattern · proof (skill output) · fix`, then `verify_report`.
Fix the small ones as a codegen_task each; propose the rest.

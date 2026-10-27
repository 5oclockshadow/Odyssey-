---
name: rewrite-output-contract
intro: Why 15 hours of self-rewrites failed ("no fenced code block", "no file blocks with allowed paths", "unterminated string literal line 159") and the output shape that passes the judge on the first try.
---
# Rewrite output contract (learned from production 2026-10-26/27)

**The failures**: 400–900 s generations on pin/thor ending in no fenced block (the reply was prose
or got cut off). Syntax errors at the same line on 4 models in a row came from whole-file rewrites of
`app/main.py` truncated mid-string. "No file blocks with allowed paths" came from paths outside autonomy
`scope.include`. Three in a row and autonomy paused.

**The shape that passes**
- Every file is a fenced block whose info string is `lang path`, for example ```` ```python app/plugins/x.py ````.
- Prefer a **new small file** (a plugin, a test) over rewriting a big one. Never re-emit `app/main.py`
  (1000+ lines). Change it only with the smallest patch the task allows.
- The path must match `scope.include` (`app/** static/** tests/** skills/** docs/**`) and not `exclude`.
- Ship the test the task's done-check names. Untested candidates are refused.
- Budget: if the file plus explanation won't fit in `max_tokens`, split the task. Don't start a block
  you can't close.

**Before answering, self-check**: blocks closed? paths allowed? Python parses (mentally)? Do imports
come only from `app.plugin_api` for plugins?

**When the same error repeats on different models**, the task is too big or the target is wrong. It
isn't the model. Shrink it and retry once, then report instead of looping.

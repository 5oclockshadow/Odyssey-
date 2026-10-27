---
name: claude-pipe-protocol
intro: How Claude and codegen talk through pipe/thread.md, and how codegen should answer so a round is useful and cheap. Read on every pipe ask.
---
# Claude ⇄ codegen protocol (learned 2026-10-27)

**The file is append-only.** Blocks are `## claude <utc-iso>` / `## codegen <utc-iso>`. Never edit
an existing block, not even a timestamp. An edit made while a reply was local wedged the clone. Headers carry
the real UTC time, because the Pipe tab's KPIs (reply p50/max, waiting) are computed from them.

**Priorities are the shared lane.** In a claude block, numbered **bold** items
(`1. **UI first.** detail`) become the priority lane in the Claude ⇄ Codegen tab, and they hold until
a newer claude block lists new ones. Work them in order.

**How codegen answers**
- Terse and structured. Lead with the answer, then `file:function` evidence.
- Say "not in graph" instead of guessing at a file you can't see.
- When asked for work, give one `rewrite: <goal>` line per item. Those go straight into autonomy.yaml.
- End state is visible in the meta line `[tool= conf= more=]`. Be honest with `conf`.

**Who does what**: Claude reads and writes the file and pushes code. Codegen (on Thor, local
models) does the heavy work. The driver `pipe/pipe.py` replies to the last claude block only, so
two claude blocks in a row mean only the newer one is answered.

**Health**: if a reply takes more than 5 min, run the pipe-and-fleet-check skill. If the clone is wedged
or the build is stale, run thor-restart.

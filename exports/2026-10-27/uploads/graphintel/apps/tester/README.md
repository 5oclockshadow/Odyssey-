# TESTER

One agent that is one graph. Its agent, brain, self, data, code and tools are the nodes of a single hypergraph (`/state/graph.json`, the
engine's file shape, Hebbian weights). It loads every app, site and page in the repository and the running stack, tests all of it, and
fixes what fails in its own copy of the repository.

```
docker compose up -d tester           # part of the stack; or: docker compose build tester && docker compose up -d tester
curl localhost:8090/health
curl localhost:8090/graph             # the whole of TESTER, in the shape apps/ops/src/connectome.js draws (?format=raw for the graph itself)
curl localhost:8090/findings          # what is wrong now, with evidence and the nodes it points at
curl localhost:8090/fixes             # verified and rejected fixes, with diffs
curl -XPOST -H "authorization: Bearer $TESTER_TOKEN" localhost:8090/fixes/<fix-id>/apply
```

## One graph

| In the graph | Nodes | Edges |
| --- | --- | --- |
| code | every file (`file:`), function and class (`code:`), test (`test:`), route (`route:`) | defined_in, imports, handles, tests |
| sites | every page | loads (scripts, styles, child components), calls (routes) |
| stack | compose services, Dockerfiles, volumes | builds, runs, depends_on, mounts |
| data | data files, stores, volumes, TESTER's own graph file | uses, remembers_in |
| tools | TESTER's tools and SEXTANT's | uses, implemented_by (the function that does it) |
| self | `agent:tester`, its own source under apps/tester | is, runs_as, runs (its checks) |
| brain | checks, runs, findings, fixes, lessons | found_by, points_at, fixes, tried, changes, learned, about |

A changed file is re-read in place: nodes that still exist keep their weight and every edge, so a lesson about a function survives edits to it.

## The loop

1. Sync the repository into the working copy (`/state/work`).
2. Read what changed into the graph.
3. Run the checks. A full run every 30 minutes; on a changed file the graph picks what to re-test: the file's own checks, the suites whose
   tests reach it, the pages that load it.
4. For each open error, ask the model with the slice of the graph nearest the finding. It can query the graph, read and search code, try an
   edit and re-run any check before it answers.
5. Verify: apply the edits to the working copy, re-read them into a scratch graph, re-run everything they reach. A fix is kept only when the
   finding is gone and nothing new failed. The working copy goes back; the fix is a patch.
6. Learn: the fix, its lesson and the edges that led to it get stronger; a rejected fix weakens them. The next failure near the same code
   is reached faster.
7. Apply: `TESTER_APPLY=propose` (default) waits for `POST /fixes/{id}/apply`; `auto` writes verified fixes to the repository, except fixes
   that touch tests. Applying refuses a file that changed since the fix was made.

## The build loop

`build.py` runs the Build Room's loop in this container over `repos/registry.json`: pack or brief, the six-check bar, pytest or `node --test`,
the site's journeys, audit, a record per round. A repo is its committed copy with TESTER's draft (`/state/build/repos/<id>`) laid over it.
SEXTANT and TESTER's agent answer with `--- file: <path>` … `--- end` blocks that land in the draft and are verified the next round; nothing
reaches `repos/` unless `TESTER_EDIT=on` and the repo passes. SEXTANT is reached with a five-minute build token signed with `SESSION_SECRET`.
`GET /build` · `POST /build/start|stop|reset` · `POST /build/repo/{id}` · `POST /build/reply/{id}` · `GET /build/files/{id}` · `GET /build/rounds`.

## Checks

`py` syntax · `js` syntax, files and inline page scripts · `templates` Design Component tags and holes · `refs` files that pages load,
Dockerfiles copy and services build from · `routes` every path a page calls is a route some server answers · `compose` variables
.env.example must list · `config` YAML and JSON parse · `secrets` keys in files, masked · `pytest` engine, mcp-hub, ops, tester and every `repos/<id>` with tests · `browser`
every page at 390 and 1440 px in Chromium (console errors, uncaught exceptions, missing files, horizontal scroll, blank pages, NaN or
undefined in the text, unnamed buttons) · `live` the running engine, site and ops, every public engine route, the site in a browser.

With no model key TESTER still reads, tests and records; it only stops fixing. Its own tests: `docker compose -f docker-compose.test.yml run --rm tester`.

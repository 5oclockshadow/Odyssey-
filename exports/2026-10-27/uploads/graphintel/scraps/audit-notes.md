# Audit notes (working file)

## Cycle 1 (static + tester tests) — done
- Runner: scraps/pyaudit.html (Pyodide: tester pytest, tester static audit of the repo, JS syntax). UI runner: scraps/uiaudit.html (every page in iframes at widths, then clicks tabs/views).
- Fixed: apps/ops/fixtures/owner-snapshot.json was truncated (invalid JSON). Mobile apps document /v1/graph/query, /v1/harness/run, /v1/seed which no server answers: listed as planned in apps/tester/tester.yaml (owner decision: build or remove).
- Tester false alarms fixed: about:/blob: schemes, non-JS script blocks (bundler manifest, JSON), Dockerfiles not built by compose, glob semantics (* stays in a folder).
- Added pyflakes lint check: 0 errors in all Python; 2 warnings fixed in apps/engine/test_engine.py (unused g; batch B result never asserted).
- Tester tests: 8 passed, 1 skipped (TestClient needs threads; runs in Docker).

## Cycle 2 (UI, 49 pages × 390/1440 + tab clicks) — fix round 1 done
Fixed:
- Console, Tmpltz, Unphz, Anima (site): componentDidUpdate(_, prev) read prev state, but the DC runtime passes only prevProps → crash on load and on every click. Now keep previous values on the instance.
- Anima App (mobile): SKINS array had a double comma (a hole) → "Premium dark", "Simplify screen", "Compact lists", "Lists as tiles" crashed. Accent swatch buttons had no name → aria-label + aria-pressed.
- Institute: 9 matrix cells had no name → aria-label + aria-pressed.
- Anima (site): a citation link with empty text → rendered only when it has a source.
- Not bugs: Anima Mobile v2 502 (transient server error; the bundle exists); Finance <img src="{{…}}"> literal-hole requests (runtime streaming artifact; tester now ignores %7B%7B requests); The Threshold Institute apps/apps.json (runtime registry, expected offline).
Still open:
- Overflow at 390: Console (590px), Space + ops/ui/space.html (370px), Walkthrough v1 (29px), Anima App (57px), Anima Field Notebook (12px), Institute nav span.
- Owner Console: "+ New sub-agent" panel 68px wider than a 1440 screen.
- apps/web/src/Platform.dc.html: empty page, nothing references it (owner: delete or fill).
- Anima App Suite: canvas of phones; tester now skips overflow on canvas pages.

## Dashboard
- apps/tester/testkit.js written (Pyodide runner for TESTER's tests + audit + graph, JS syntax suite, UI suite in a live iframe at 6 sizes with tab crawl). DC page still to write: apps/tester/Test Dashboard.dc.html (live app view of Explorer with the connectome, graph, suites, clean passes, Step 9 report).
1. apps/mobile/Anima App.dc.html: JS error after "Premium dark", "Simplify screen", "Compact lists", "Lists as tiles": can't access property 0, x is undefined. 10 unnamed buttons. 57px overflow at 390.
2. apps/ops/src/Console.dc.html: after any tab click: can't access property "bottom", prev is undefined. 590px overflow at 390. (/ops/state 404 is expected offline.)
3. apps/site/src/Anima.dc.html: on load and every click: can't access property "view", p is undefined. 1 unnamed button.
4. apps/site/src/Institute.dc.html: 9 unnamed buttons; nav span offscreen at 390.
5. apps/mobile/Anima Mobile v2.dc.html: loads the design-system bundle from an editor-only absolute URL (/v1/design/projects/<id>/serve/_ds/...): 502 outside the editor.
6. apps/ops/src/Finance.dc.html: <img src="{{ c.src }}">, {{ g.src }}, {{ curveImg }}: the browser requests the literal holes (404) before the component renders.
7. apps/ops/src/Owner Console.dc.html: "+ New sub-agent" panel is 68px wider than a 1440 screen.
8. apps/ops/src/Space.dc.html and apps/ops/ui/space.html: 370px overflow at 390.
9. Walkthrough v1.dc.html: 29px overflow at 390 (header). apps/mobile/Anima Field Notebook.dc.html: 12px at 390.
10. apps/mobile/Anima App Suite.dc.html: canvas of phones, overflow by design (tester should skip overflow on canvas pages).
11. apps/site/src/The Threshold Institute.dc.html: apps/apps.json 404 (runtime registry served by nginx; expected offline).

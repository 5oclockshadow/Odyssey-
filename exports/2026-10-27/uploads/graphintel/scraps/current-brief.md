# Current brief (kept on disk so it survives trimming)

## Asks, verbatim
m0146: "simulate it with real dspy agent, config switches auto once in production, dspy agent for live simulation .. non repeating as real as possible" (the Explorer showed a DEMO DATA banner: "No engine answered at /api (HTTP 404)"; earlier: "make live as possible wire for backend but use localstorage and have him do real work... anything, no demo no mock"; "reexamine my whole ask from the beginning and return something way cooler and better").

m0148: "more details and cta and views and widget and all where and for what appropriate. have it truly talk gpus and the gpu bubble currently going on, actually reprice fairly commodities and assets and show why, gather all data. all of this is for the institute to do, not you claude... seed and otherwise just make sure this happens, should be ongoing ... what are the limitation and go for better knowing that... show me as well the various sort of api calls that will be made from players spanning civilians to corporate to gov to children, scholars, etc"

## Done (engine, written, not run: no Python here)
- sim.py: DSPy world-agent (WorldTurn signature), non-repeating (novelty + seen ledger + beat rotation), mode sim|live|auto (auto = live when THRESHOLD_ENV=production)
- reprice.py: fair repricing ledger + limitations ledger, gates (scenarios sum to 1 and span both directions, range agrees, sourced drivers, limits, simulated never publishable)
- tools reprice_list / reprice_record / limit_note; main.py world_forever, reprice_forever (every 3rd round = limitations); institute.yaml: seeds g-gpu + q-gpu-*, topics, feeds, world:, reprice: (watchlist, limits, intake)
- v1.py: /v1 API with keys, personas (civilian, student, child, scholar, journalist, corporate, government, developer), metering by rung (graph rung added), apikeys.verify/spent/child_safe
- serve.py: /owner/world, /owner/reprice, /owner/reprice/{id}/publish, /owner/limits/{id}, /public/reprice; provenance responses carry world
- ledger.py: **extra, title fixes; provenance.py: sim flags; tests: test_world.py

## To do (browser)
- apps/ops/src/livesim.js: in-browser stand-in when no engine answers (Claude plays world + SEXTANT; real CORS-open gatherers where reachable; localStorage; same shapes as the engine)
- Explorer.dc.html: replace demoRaw with LiveSim; world strip + switch (Simulate/Auto/Live); Reprice and Limits views; CTAs; widgets
- apps/ops/src/API Atlas.dc.html: personas x calls (shape examples with placeholders, no invented numbers)
- ready_for_verification; final summary must say: nothing Python was run; browser sim is Claude standing in for the DSPy agent

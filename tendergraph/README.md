# TenderGraph

Self-maintaining, self-improving, **bid-seeking** agent-graph for public & private
work — all cities + their government/infrastructure/sentiment data, expanding to
gov/military and companies (capex ≥ $50M). Built on the **Skilld** framework
(Agent = Graph, single DSPy OutputField, RAPTOR, Hebbian + Q-table) with
**osiiso** execution routing (ASYNC/THREAD/PROCESS, temporal multi-lane,
non-blocking) and the reused **recorder** + **Tester** peers.

## Run
    cp .env.sample .env   # edit if your router/ports differ
    ./run.sh              # serves on :9905, auto-on, pause-only

Key routes: `/status` `/tenders` `/packages` `/graph?query=` `/tick`
`/pause` `/resume` `/halt` `/recorder/stream`.

Offline by default (deterministic sample tenders incl. Edmonton roads/sewer/IT +
a federal defence tender) so it runs with zero network; wire live connectors per
`skills/tendergraph-mandate.md`.

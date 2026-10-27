# Build prompt: the Bitcoin graph agent (`btc-agent`)

Paste this into a coding agent that has the Threshold repository open.

---

You are building **btc-agent**, an autonomous, graph-intelligent agent that studies the public Bitcoin blockchain for one question the Institute already holds as `q-btc`: *what does the public transaction graph show about key reuse and miner concentration that is not already reported?* Its falsifier is the Institute's own: **a finding that also appears in a degree-preserving shuffle of the same graph is not a finding.**

## What it will and will not do
- It reads public data only (mempool.space or Blockstream Esplora, no key; or your own Bitcoin Core RPC through `BTC_RPC_URL`). Default 2 requests a second, exponential backoff, cache by hash.
- It does **not** mine, does not brute-force anything, and **never computes, recovers or stores a private key.** Spotting the same ECDSA `r` value reused under one public key is a flag to disclose, never a step toward recovering the key. It never moves or sweeps funds and never links an address to a named person.
- Every output is a **finding record** carrying block heights, txids, the method hash and the shuffle-control result. A finding without them is refused by code.

## Shape
A sibling service in `docker-compose.yml`, not a module inside the engine. Own process, own event loop, own state under `state/btc/`. It shares nothing with SEXTANT's loop except the graph, the ledger and the bus, so neither can block the other.
- Registers itself in the fleet as a **sibling** sub-agent with `from_node: q-btc`, so the Explorer shows who hired it and why.
- Talks to the engine through JSON lines: it appends `ledger` rows (`plan` / `start` / `finish` with `node_ids`, `origin: "btc-agent"`) and publishes `btc.finding` events on the bus. A thin bridge in the engine merges those into the graph (`graph.observe`, node types `block`, `cluster`, `pool`, `finding`; edges `spends`, `pays`, `same_cluster`, `mined_by`, `reuses`).
- It has its own DSPy program. Signatures: `NextWindow` (choose the next block window by staleness and uncertainty), `Interpret` (turn measured statistics into a candidate finding with its falsifier), `Disclose` (draft the maintainer notice or aggregate post; the owner approves, it never sends).

## Pipeline, each phase gated by code that must pass
1. **Verify.** Fetch an 80-byte header, double-SHA-256 it, check it equals the reported hash and is at or below the target decoded from `bits`. Test vector: genesis, `000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f`.
2. **Measure.** Over a window of N blocks: common-input-ownership clusters, address reuse after spend, coinbase-tag shares and their Herfindahl index per pool, repeated `r` under one pubkey (flag only).
3. **Control.** Degree-preserving shuffle of the same graph, 200 draws. Keep a finding only if its statistic lies outside the shuffle's 95% band.
4. **Disclose.** Aggregate statistics may be published (owner approves). Anything touching a specific weak key goes to a draft notice for the maintainer and is never published.

## Concurrency (this is the point)
- Four `asyncio` tasks: `watch` (new tip), `scan` (windows), `analyse` (CPU work in a process pool), `report`. Bounded queues, backpressure, cooperative cancellation, per-task timeouts.
- A slow or failing public API must never stall `analyse`, and nothing in btc-agent may hold a lock the engine needs.
- Heartbeat line every 30 s into the fleet log; a hard daily request and model-token budget in `institute.yaml` under `btc:`.

## Tests (pure: no network, no Docker, no model)
Genesis vector; a hand-built 3-block chain; clustering on a hand-built transaction set; the shuffle preserves every degree; the disclosure gate refuses a finding without txids; **no code path can emit a private key** (grep-style test over the module plus a runtime check); a concurrency test where a deliberately slow fetch runs beside a fake engine loop and both keep progressing (assert on timing). Every test checks one fact and fails when you break that fact.

## Done when
`pytest -q` passes; `docker compose up btc-agent` starts it and it appears in the console fleet as a sibling; the Explorer's Bitcoin lane shows blocks verified, clusters and findings with their control results; it runs next to SEXTANT for an hour with neither queue stalling; and the README says plainly that it finds weak or reused keys and discloses them, and does nothing else.

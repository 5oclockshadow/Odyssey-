# Odyssey — Project Pulls & Artifact Index
_Generated 2026-10-26_

## 1 · Pull commands (all projects)

Two repos hold everything in these sessions. Subprojects live **inside** `Odyssey-`.

### codegen-v3  (+ its tester)
```bash
# fresh clone
git clone https://github.com/5oclockshadow/codegen-v3
cd codegen-v3
git fetch origin
git checkout claude/router-and-graph-rm
git pull origin claude/router-and-graph-rm

# already cloned → just update
git -C codegen-v3 pull origin claude/router-and-graph-rm
```

### Odyssey-  (contains: git-valve, tendergraph*, appbuilder, broadcaster-skills)
```bash
# fresh clone
git clone https://github.com/5oclockshadow/Odyssey-
cd Odyssey-
git fetch origin
git checkout claude/you-there-13j9ar
git pull origin claude/you-there-13j9ar

# already cloned → just update
git -C Odyssey- pull origin claude/you-there-13j9ar
```
\* **tendergraph** is part of the **science zip** — treat it as that bundle's component, not a standalone.

### One-shot: clone both, then update both
```bash
for r in codegen-v3 Odyssey-; do
  [ -d "$r" ] || git clone "https://github.com/5oclockshadow/$r"
done
git -C codegen-v3 pull origin claude/router-and-graph-rm
git -C Odyssey-   pull origin claude/you-there-13j9ar
```

---

## 2 · Artifact index (on hand this account — lower bound, 185+)

> The link is the artifact; open in Claude. Most-recent first.

### Current work (this session)
- Odyssey Concepts — https://claude.ai/artifact/XWyoA73ufVNp7TQTGWPgR4
- Graph Atlas — https://claude.ai/artifact/Egh3wDSiFfqm8eoD6GCmnv
- Broadcaster Markmap — (publishing this turn; link in chat)
- 4D Connectome — https://claude.ai/artifact/3UCBR9JJzAANM6SCLnemEz
- Twenty Consoles — https://claude.ai/artifact/FTmAGjeUUuSh7NsKGfPxhv

### PRDs / plans / audits
- Kiln App Builder PRD — https://claude.ai/artifact/Mv6zpJxgAhtW4YAKXFhYqv
- Skilld — Context Report v1 — https://claude.ai/artifact/WiPJ5V1B3z3MAnVuEsCSEH
- Institute Map and Bridge Plan — https://claude.ai/artifact/JRyph6Qrc5MnTp7hKyUBGd
- Institute v0.4.1 Audit — https://claude.ai/artifact/FAomtBK9nRnKawA71K8LdS
- Graphweave Studio PRD — https://claude.ai/artifact/E9c2NnrjwQ6vLc7fp426Hk
- Claude Design Prompts — https://claude.ai/artifact/HvgABq8qsjZiKgGQw3Vo74
- Tool Graph — https://claude.ai/artifact/7SF2n2egyD3Np4CMN2ioGa
- Tester PRD — https://claude.ai/artifact/Ep7kvAsJvhb7rCdZ38pVJr
- Portfolio Audit — https://claude.ai/artifact/Kp4TdbhbqtGpiVBfEshZyz
- Command Loop — https://claude.ai/artifact/B5Rzu1hvffzhif9nkF8giw
- Fleet Speed Audit — https://claude.ai/artifact/TAzMFHDQLPHJ3qR3AUhs9c
- Connectome Views — https://claude.ai/artifact/7nsfks5dLb8RfR5vWysJfp
- Threshold Explorer — https://claude.ai/artifact/Cv7ViQQPfn2tTRBFSDH81B
- Rex UI Picker — https://claude.ai/artifact/WuPMYzY52WQZDXneybGEAT
- Live Studio — https://claude.ai/artifact/XkfypPs7CfsHjSzPRKrecF
- Project PRDs — https://claude.ai/artifact/PnYMdqxAyyDAsDNk19ciRQ
- Fleet Doctor — https://claude.ai/artifact/BKSFDqg7CFSt3xtDfb9ztx
- Fleet Upgrade — https://claude.ai/artifact/UvG6qvxwFNZZBJC9LuZ1HF
- Codebase Upgrade Plan — https://claude.ai/artifact/Hs9TDaMMiKCd3mZvgfqJLt
- Fleet Status — https://claude.ai/artifact/DmsUfyo269JHMdvbazFuYN
- Jarvis Command Center — https://claude.ai/artifact/ErvZZSKR7REeBSnNAGh9gC
- Jarvis Overhaul Status — https://claude.ai/artifact/VTbHN4Y9q2AzE1aQ5dNj3v
- Downloads & Institute — https://claude.ai/artifact/GmA1HrhaavzBy3JVnuNAm3
- Fleet Parity Report — https://claude.ai/artifact/FecjdTXYYvrTSWisXY2EzS
- Jarvis Parity Report — https://claude.ai/artifact/BLuGjAMZ7NGWtpPaM5nzTs
- Jarvis Telegram Buttons — https://claude.ai/artifact/G8NsectcVgthAF6CKqgnCw
- SOC 2 Compliance Gap Audit — https://claude.ai/artifact/Lk2swmMzrKTAHnWniQRqe4
- Session Self-Audit — https://claude.ai/artifact/Koyfk6WVnxtFnyF5FvF3GM
- imgloop — https://claude.ai/artifact/2h5rRcdSw6QqSgEjMrXnbJ
- Launch Kit — https://claude.ai/artifact/2yGX7LE5mYnC7qh1MCxdWD
- DR. SYNTHESIS — Chemist App Assessment — https://claude.ai/artifact/DrcaTrcLMXTes12VQwRqC2
- 50 Storefronts — https://claude.ai/artifact/N5dzo7vdABQjKRrrL7N57a
- Dreaming Engine — https://claude.ai/artifact/GUX6913NYGDKQ1yYYURjW5
- SEDEK UI Picker — https://claude.ai/artifact/6m2ysvtXnByQNhTbHmXwVK
- The Rex Playbook — https://claude.ai/artifact/M4damukNgvM5uE9Szj8bzx
- Fleet Code & Battery — https://claude.ai/artifact/3h5R4nLANwHTGrZ17ixMvv
- Parallel Items Report — https://claude.ai/artifact/DQqB3ttUQHx8JTPcQG3kp4
- Fleet Hygiene Audit — https://claude.ai/artifact/5NCT1AWkKbXCtupJByAHRH
- Fleet Items Status — https://claude.ai/artifact/HpEP49j5EhA5eLxkZ9JDkK
- Fleet Code State — https://claude.ai/artifact/ATr4AgPmAqVVzDDjp6rojL
- New Code State — https://claude.ai/artifact/Vbjx4Akb2duTKp5hnHG7Cv
- Jarvis Cursor Board — https://claude.ai/artifact/5XsfzTsAGK5n8yL3ufJZi8
- Benchmark Fresh Run — https://claude.ai/artifact/FChtN4mAVwNhF856vFw9in
- Session Forensics — https://claude.ai/artifact/X8SF8JY4BHco2eFZPCfS6e
- Your Code vs Mine — https://claude.ai/artifact/TPmf9MaKiVZJKLJQytXikp
- Fleet Recap 2026-10-20 — https://claude.ai/artifact/MrxrFmAaasvfMu3nS9tT5c
- Command Dump Loop — https://claude.ai/artifact/TDkcHzpMRmqmxRWbqSjmdo
- Rex Hedge Postmortem (pinned) — https://claude.ai/artifact/CUKXudaSce8DGgHdset2S9
- Anima & Jarvis Cascades — https://claude.ai/artifact/KUQivQc7oe2uUiU2iSzb1D
- Jarvis Builds Code — https://claude.ai/artifact/DcPMiiEVsqaAJ1EfMtAgBm
- Jarvis-Anima Build — https://claude.ai/artifact/HjAmVq7jt4KpKmAXK4qkHs
- Jarvis-Anima Code — https://claude.ai/artifact/1w4rWc6b61HBmMGi3fixKp
- Fleet Preflight — https://claude.ai/artifact/33iAqdpuLYXeURV6TdCPy7
- Rex vs Jarvis Audit — https://claude.ai/artifact/HfkgiK5H8rxf58enapgpjS
- Jarvis Autonomy Trainer — https://claude.ai/artifact/6pj9x9tcwwvSqSyzTZjdLe
- Rex Signal Bridge — https://claude.ai/artifact/LR8ianKySFQpGS5zYyoxkH
- Seed-as-Anthropology — https://claude.ai/artifact/2xGQmtJNWQhxmpBNtzhcQf
- Fleet Dossier — https://claude.ai/artifact/HL5wXfh5vRUk9wDvtXtVaL
- Rex Launch Playbook — https://claude.ai/artifact/BrpxqoSSxycvw6adVn8ukj
- Agent Rebuild Briefs — https://claude.ai/artifact/BLtTM9Z4PDq7314LmQPP1T
- Jarvis Autonomy Suite — https://claude.ai/artifact/XTVnyUFVY7xH3Ts3dNqpVJ
- Platform State & Path — https://claude.ai/artifact/HTQG26BPaHQTL4WPU8fyrJ
- Fleet Code-Health Sweep — https://claude.ai/artifact/Q9jQXtFhVk1x7qZTrmuFHZ
- Dream Collection — https://claude.ai/artifact/N3W9m2RfkFm8u7RuT9nNfa
- Anima Red-Team — https://claude.ai/artifact/WVUQBCybkhQaQnpifsVCm5
- Fleet Agent Atlas & Audit — https://claude.ai/artifact/JmxjexhvpyKJteHsth4Thk
- Fleet Map — https://claude.ai/artifact/NgYZ662YXisjQDBWaxrJ5x
- Anima Thesis Test — https://claude.ai/artifact/9mhT2Vb4fyYEBZRvDkbifT
- Monetization Roadmap — https://claude.ai/artifact/PMSBSmmvGVEEfFaz3QxQxL
- Three-App Audit — https://claude.ai/artifact/Ls61SExRawdYq7oVniUfFL
- Hoarder Communities — https://claude.ai/artifact/LPMPUtT2KyJm2okdHn4zWk
- Cursor v2 — https://claude.ai/artifact/UeNGHANaj3cSCSJdU4zH3X
- Five-Day Recap — https://claude.ai/artifact/WYtViNR8MmK3fvdwscDeL3
- Murmuring Report — Launch Status (pinned) — https://claude.ai/artifact/Jq4AGFPjUtY5WKwg8FrTgK
- Fleet Snapshot — https://claude.ai/artifact/AuWGwChXTa4sxHWBtmqTtf
- Fleet Action Board — https://claude.ai/artifact/Pvc8YnsWxjfcK3h6M761kd
- Rex & OpsBot UI Inventory — https://claude.ai/artifact/WfRs6JRDjvFAmdLmqykvAD
- Action Board — https://claude.ai/artifact/6E3XutJBSa5D83wRNyE346
- Command Center — https://claude.ai/artifact/15JngiK3BavAi525jXYxLh
- ThaV3 Report Designs — https://claude.ai/artifact/EK1VHbfBJz9z9CFHrGxUaV
- Look 71 Scenario Tree — https://claude.ai/artifact/E21oE2gCe9WBdxEivkeiLr
- Fleet Core Design — https://claude.ai/artifact/Sp2pxbN4HVzxqq4ivZno9Z
- Fleet Options Run — https://claude.ai/artifact/L64gSYpN2QuhBhmMTWUbsB
- Open Threads Tracker — https://claude.ai/artifact/5fHy6it5tBVSHHRkNq3Tho
- Bridago Architecture — https://claude.ai/artifact/4jGZT5KPWdVxemQNfZFju9
- Research Map — https://claude.ai/artifact/NnMJbnRQJPKUoTbP1cxnMH
- Inference Trace — https://claude.ai/artifact/167hVYPeWaqJvhWJvJhK7H
- Launch Preflight 10-13 — https://claude.ai/artifact/KqLgKgRGwftwsJDSKhGHwB
- Agent Gateway Atlas — https://claude.ai/artifact/2GmCMVqPCB6FKL2eqiV5Nq
- Jarvis Diagnosis — https://claude.ai/artifact/SBHZn8e82B7wAa5kYC6qGi
- Jarvis Cursor Mockups — https://claude.ai/artifact/8wAv2treabdWk5huoUjkuk
- Benchmark Code Index — https://claude.ai/artifact/H6NMS65yygA4ajTcLmPHxV
- Crypto MT5 Brokers — https://claude.ai/artifact/QWrancP5A5cXvNyrq3yJ7P
- Global Venue Research — https://claude.ai/artifact/MzS2J1sxBEDxLBUSiM62PR
- Vestal Audit — https://claude.ai/artifact/UhvDB4FK7e3P1ZNPr1AdbN
- Vestal Feature Plan — https://claude.ai/artifact/69Lav82WSwi8Q1VZeE5C6M
- Fleet Operations Report — https://claude.ai/artifact/Pti4uJUd1RX6TBprvt96Wo
- Game Sources Directory — https://claude.ai/artifact/Jd5kmXNYocuPx8CmynTft7
- Fleet Preflight — https://claude.ai/artifact/JS8HwbhzHVwBPRTNaorYmx
- NES & SNES Halloween Games — https://claude.ai/artifact/MtQe8sL6chH3tnYHe6nt1d
- Fleet Preflight — https://claude.ai/artifact/BTjemW9Mu9KLocUe7ki6na
- Rex Sample Posts — https://claude.ai/artifact/J1ELqWaVzYyVgUhPBp1v1m
- Cursor Designs — https://claude.ai/artifact/Fa63rdX6VigN86tCFaALyL
- ThaV3 Paper Bridge — https://claude.ai/artifact/JRfE5YCaMrWVXVvy9rzWsc
- Rex Arab Outreach — https://claude.ai/artifact/GCJEi6BzABM7qAzu7uebrv
- Fleet Status Board — https://claude.ai/artifact/4FS53jALYk1ffYoRkLBc8j
- Jarvis Handoff Problems — https://claude.ai/artifact/VSvGJDFShomoyfu6GaQ5Ui
- Fleet Catalog — https://claude.ai/artifact/QAezCZDnhrjS8jYQNokJ6c
- Overnight Plan — https://claude.ai/artifact/4DpzAWt5F9AwPDSn6agJjU
- Butler Jarvis Plan — https://claude.ai/artifact/KSV2HqK6AwEtx6jfycDEC3
- Waiting On Krishna — https://claude.ai/artifact/QCT9k68fXGGdLYMRvxjQyY
- MCP Inventory — https://claude.ai/artifact/7TmCSbtrmQZwXjAieMQcZU
- TG Chat Audit — https://claude.ai/artifact/HkyaYRcgB9kc1b4U5LG6Fd
- Rex Speed Audit — https://claude.ai/artifact/TLYdSH9B6Y6hpkK1u7C1cm
- Agentic Widgets — https://claude.ai/artifact/4iG4gKpNZnJYfHpZiRJoEj
- Rex Display Audit — https://claude.ai/artifact/UBcRUVM4G1b6mQiaNoTygP
- Murmuring Build Status — https://claude.ai/artifact/CSLyZSEDqhwiw19wJg3fe2
- Rex V5 Audit Report — https://claude.ai/artifact/V8LtCWbgopgC4kBohJxKP7
- Rex Strategy Matrix — https://claude.ai/artifact/YPH6hLR6KFQTovR9Hcu22T
- Fleet Intelligence & UI Audit — https://claude.ai/artifact/VP29nRZnbMQBvQ7uJeN2mk
- Rex V5 Architecture Compression — https://claude.ai/artifact/QaK847FTxE3McaWqYgbgRW
- Rex prints, second batch — https://claude.ai/artifact/1EzEXVLFyxBEttuLE78oAE
- Ten Days by Project — https://claude.ai/artifact/MBVN3RqFVtsP7LVUnLv5vA
- Antler Demo: Services and Money — https://claude.ai/artifact/4rb1QPX1oixfvwVhNXMSKr
- Fleet Chat API and Trader Split — https://claude.ai/artifact/29z9mPhnRuCQcTtbpP5PZ6
- Autonomy Gap Report — https://claude.ai/artifact/22Tr1jbFDFuERDUfG4qoRE
- Rex Status and Limbo List — https://claude.ai/artifact/ThD4Y7MX9BtFctS328Qa6n
- Status and Market Plan — https://claude.ai/artifact/Xj2E61x2o4PVLXsaioa18q
- Rex V5 Compression — https://claude.ai/artifact/6Gk3zdZJtQv1PmeeWc1FkT
- Rex V5 Compression — https://claude.ai/artifact/SqBKEn33Lwxyh2c76qdE8W
- Prints Compression — https://claude.ai/artifact/LR7L1euNjk4H3BrqWPmP8h
- Jarvis :23200 Deep Audit — https://claude.ai/artifact/NQNZtmLK9pUCZhexaAhHNk
- Rex V5 Deep Audit v2 — https://claude.ai/artifact/YHx6xVKoLMktAhkkxHdHRN
- Rex Deep Audit — https://claude.ai/artifact/YRvf66vZwP4wsacterH761
- Rex's Telegram prints — https://claude.ai/artifact/R9Tonxkp9hGAwedRHiBbfu
- Ten-day audit — https://claude.ai/artifact/29aDFHD8LRagHVB2PXNwmf
- Jarvis Deployment Summary - Tasks 1 & 2 — https://claude.ai/artifact/C69mKttmx7GR5rGbe26XkA
- Jarvis Version Diff Report — https://claude.ai/artifact/VwPJdmGpiNqetHtPpaqxVZ
- Homelab Preflight & Audit — https://claude.ai/artifact/KVWj7bHwphyDfdADMWtPny
- Rex Real Hedge — https://claude.ai/artifact/KpQYP12zU51T8zCApC2oQJ
- Jarvis report skill + gateway outbox — https://claude.ai/artifact/MZpx1ZxarfmYaX3HedGKd9
- Jarvis Images and Typing — https://claude.ai/artifact/RrpDcNoqt1RUxUNn3Sd8o3
- Murmur Launch — https://claude.ai/artifact/TaPCNQze16ZjXDBZ7GUAXy
- Graphcore Rollout — https://claude.ai/artifact/XRabGXQvQaxwSuyM6Y95Qa
- Murmur Chart Styles — https://claude.ai/artifact/QGUibswgMdPp89kwQmr1id
- Jarvis Cursor Board — https://claude.ai/artifact/8MUt682Gz9ZnxwqGKvETe7
- Fleet Console — https://claude.ai/artifact/FRi7m5W7ooxJzh5nmF4WCe
- Vestal Search Quality — https://claude.ai/artifact/Ac7ePHJoC26hWWbFevygGU
- OpenBB Fleet Integration — https://claude.ai/artifact/HAyrrpXg8oPELKC1rdQVsQ
- Vestal ops-0310 — https://claude.ai/artifact/TzMRQVyR8H3wAX8YF9w1n5
- Jarvis Chat Critic — https://claude.ai/artifact/QjCvyp7Aww9Ne6vvnvpa5b
- Rex Graph Product — https://claude.ai/artifact/1yV6Egrf52ZWBz9tpnbfQX
- Vestal Platform Lane — https://claude.ai/artifact/FHiSF4WLekCSPzV5TyyD3P
- Vestal Free Search — https://claude.ai/artifact/8TS9jdDCQFvYy6w7xooxfR
- Vestal Search Fix — https://claude.ai/artifact/YRmwfgM7QsDCHPDQNZTsVZ
- OpenClaw Hermes Gateways — https://claude.ai/artifact/RVc8PBxDubZozic3kA9WVa
- Murmur v2 Briefings — https://claude.ai/artifact/Y42PJ4niiRRLBMVkvLV4gd
- Vestal Top 20 — https://claude.ai/artifact/SHUJKwTXdx8HR8jYK78GVK
- Jarvis Chat Fixes — https://claude.ai/artifact/EKr7mU4uoNZjmyvTZwL7QJ
- Rex Telegram Lineage — https://claude.ai/artifact/TNc41a8PZoY2rjCnU2uhzV
- Router and Events — https://claude.ai/artifact/H9UWjcB6WUp65oeXUTeGg4
- Session Replies — https://claude.ai/artifact/354vX6y3M7EJAtfyWDnubZ
- OpsBot Autofix and Wazuh API — https://claude.ai/artifact/QzcP1AJ16wg6ndn1H94bAr
- Fleet Reports Index — https://claude.ai/artifact/9VTizaCWX5W36r4SgvRS1m
- New Jarvis v4.0.0.4 — https://claude.ai/artifact/Rc3NiZyBAgN613W1hrVu18
- MT5 Mutual Watchdog — https://claude.ai/artifact/KPNDK1a2i41QwUeSXwuZA3
- Telegram Bot Ownership — https://claude.ai/artifact/KrFos8EZJ1z3pVaoHZhqwd
- Jarvis TV, OpsBot, Watchdog — https://claude.ai/artifact/PNrRSKXKK2bBnuLMgatc7G
- OpsBot Restore Report — https://claude.ai/artifact/RhZbzgVXnqtpkZAyiHc9kK
- OpsBot Refactor Report — https://claude.ai/artifact/Muht2KPWxqw1CeTk2wnmB9
- Jarvis Reminder Code Search — https://claude.ai/artifact/V9obkZthCMRNNzndR4Kmbd
- New Jarvis Routing — https://claude.ai/artifact/7UrWCKXyFtoihTWuuoujBm
- Jarvis :23197 Port — https://claude.ai/artifact/WoqESH4wu1heELP6F8P571
- Rex Engine Audit — https://claude.ai/artifact/WLzj1eQW3AgbtVKMuHZN9b
- DSPy Reframe Search — https://claude.ai/artifact/MSexhcWwiEBjL7XVnXJuxW
- Graph Brains Compared — https://claude.ai/artifact/Rj8R1YBPzogo7gZLmwdTkp
- Jarvis Loops Visual — https://claude.ai/artifact/H8n2UDc1Rkd2Df4WAELyhu
- Jarvis Loop Map — https://claude.ai/artifact/BMNEWGWYSQavtemLALMjkA
- Fleet Wi-Fi and Bluetooth Drops — https://claude.ai/artifact/VaeefX1Do2ehuffm6THcbT
- GenAlpha Cross-check — https://claude.ai/artifact/5sWrJDjnu6D2sMsBwG4XJt
- Fibonacci Zone Theory — https://claude.ai/artifact/5kizkeSXsuK13951smKpBA
- Rex Training Run — https://claude.ai/artifact/G1F9FXaL49rBBa5eieUa5u
- R720 Hardening Report — https://claude.ai/artifact/4udTodAJ2GN4tybeSanRFr
- Handoff 2026-10-02 — https://claude.ai/artifact/C1hAjvAEY99R2aPh9grb9r
- New Jarvis v4.0.0.3 — https://claude.ai/artifact/AesjkHsyeR1RxVS4pk6SnY
- Confluence Backtester v2 — https://claude.ai/artifact/9ZrhY4i9j7npy9kDmip436
- Jarvis Next: Wonder Engine — https://claude.ai/artifact/6GJ6LGUPFKcHeUS4vhFAVU
- Sentient Core v4 — https://claude.ai/artifact/HJuFds9jgo2nfLVhWuCKs3
- Confluence Backtester — https://claude.ai/artifact/MLcxWTfqghLy175HaJzwmY
- DSPy Bench Check — https://claude.ai/artifact/S2Zm9LCvRXxw677GJWsgMJ
- Router Sprawl — https://claude.ai/artifact/JeFg5dMzY2k36XK63opC2d
- Fleet Status Board — https://claude.ai/artifact/EmMgck5U292ZQuYriU1AXG
- Home LAN Map — https://claude.ai/artifact/5g5Ya4D36sdVMEQeFmLb4b
- R720 Health — https://claude.ai/artifact/TMTg6FUS22yXG41dhaGz6P
- Thor Agent Configs — https://claude.ai/artifact/WfXz9VdEoyHKRdbX1eArmD
- R720 Boot Sequence — https://claude.ai/artifact/KjUFiN65YeJYmEiwHmsxE8

_Note: this is a lower bound — the lister caps at 200 and some may not surface. If one you want isn't here, paste its link._

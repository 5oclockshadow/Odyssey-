# Risk register

L = likelihood, I = impact (1 low, 3 high).

| ID | Risk | L | I | Treatment | Status |
| --- | --- | --- | --- | --- | --- |
| R1 | ops mounts the host Docker socket; a stolen owner session controls the host | 2 | 3 | Strong password hash, lockout, MFA, TLS, IP allow-list for `/space` and `/terminal`; consider a socket proxy limited to needed calls | open |
| R2 | No login rate limit; password guessing | 2 | 3 | Rate limit and lock out `/auth/login` | open |
| R3 | Unsalted SHA-256 password hash | 2 | 2 | Move to scrypt/argon2 | open |
| R4 | Opaque ids fall back to a constant secret when SESSION_SECRET is unset | 2 | 2 | Refuse to start without SESSION_SECRET | open |
| R5 | Plain HTTP between visitors and nginx | 3 | 3 | TLS termination and HSTS | open |
| R6 | Phoenix on 6006 exposed | 2 | 2 | Firewall or put behind owner login | open |
| R7 | Prompt injection through fetched web pages causing bad tool use | 3 | 2 | Tools gated; no self-edit; publish and posts need approval; sandbox has no network | mitigated by design, untested |
| R8 | Agent publishes something false | 2 | 3 | Owner approval with sources; retract path | mitigated by design |
| R9 | Posting that reads as spam or breaks platform rules | 2 | 2 | Mindful gate, drafts only while publishing is off | mitigated by design |
| R10 | Loss of `/state` (graph, records) | 2 | 3 | Backup and restore drill | open |
| R11 | Visitor text contains personal data kept without retention rule | 2 | 2 | Retention and deletion procedure | open |
| R12 | Model provider outage or cost runaway | 3 | 1 | Queue and degrade; spend cap at provider | open |
| R13 | Unpinned dependencies | 2 | 2 | Pin and scan | open |
| R14 | Nothing has been executed; defects unknown | 3 | 2 | Run suites three times, fix | open |

# Third-party inventory

| Vendor | Data it receives | Purpose |
| --- | --- | --- |
| Anthropic (model API) | Prompts: graph slice, tool results, visitor chat text | The agents' model |
| GitHub | Pull requests, repository contents | Upgrades and repairs |
| Web search / fetched sites | Search queries | Research |
| arXiv, Hacker News | None sent beyond requests | Feeds |
| Slack, X, LinkedIn, Reddit | Approved post text | Mindful posting |
| Wolfram Alpha, Apify, MCP market | Tool queries | MCP hub tools |
| Docker Hub / package registries | Image and package pulls | Build |
| Google Fonts, jsDelivr (three.js) | Visitor IP and user agent from the browser | Page assets; self-host to remove |

Review date for both tables: 2027-01-10 (owner).

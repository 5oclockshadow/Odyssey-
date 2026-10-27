# Policy set (draft, unsigned)

Owner for every policy: the operator. Next review: 2027-01-10.

1. **Information security.** One owner account. Secrets live only in the environment. No secret in code, logs or images. All outbound content passes the approval path.
2. **Acceptable use.** The agents do not reply to, follow or message anyone; they post only through the mindful gate with an agent disclosure; they never publish unapproved material.
3. **Access review.** Quarterly: confirm the only credential holders are the owner; rotate SESSION_SECRET, HUB_TOKEN, REDIS_PASSWORD and provider keys; revoke unused tokens.
4. **Data retention.** Published items stay until retracted. Round records and visitor text: keep 90 days, then delete (**not yet implemented**; tracked as gap C1.2).
5. **Change management.** Code changes only by pull request; the full test suite must pass in the sandbox first; the owner reviews and merges; each release gets a tag and a changelog entry.
6. **Vendor management.** Inventory in RISK_AND_VENDORS.md; review twice a year; add a vendor only after recording what data it receives.
7. **Backup and recovery.** Daily copy of `/state` to storage the stack cannot write to; restore drill each quarter. RTO 4 hours, RPO 24 hours (targets, untested).

# Incident response runbook

1. **Detect.** Phoenix error spans, engine incidents (agent space, Upgrades and repairs), container state in the console, any report from a visitor.
2. **Contain.** Rotate SESSION_SECRET (signs everyone out); stop the `agent` and `ops` containers; turn publishing and posting off in `institute.yaml`; retract affected published batches.
3. **Assess.** Read the round record and hub `audit.jsonl` for the window; list what was published, posted, or run.
4. **Eradicate and recover.** Fix by pull request; restore `/state` from backup if corrupted; rotate any exposed credential at its provider.
5. **Notify.** Tell affected people and the platforms involved; record the decision and time.
6. **Learn.** Add a test that would have caught it; update the risk register; log in EXECUTION_LOG.md.

Severity: S1 credential or host exposure; S2 wrong or private content published; S3 service down; S4 cosmetic.

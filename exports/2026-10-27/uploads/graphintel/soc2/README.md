# SOC 2 readiness package (draft 1, 2026-10-10)

This is a readiness package: the controls, policies and evidence a SOC 2 audit examines. It is **not** a SOC 2 report and not a certification. Only an independent CPA firm can issue one.

**Status: nothing in this package has been executed.** The code and tests were written and statically cross-checked, but no test run, container build or restore drill has happened (no Python or Docker was available while building). Every control below is therefore marked `designed`, `implemented-untested`, `gap` or `n/a`, never `verified`. The first job on a real host is to run the suite three times and replace the evidence placeholders.

| File | What it is |
| --- | --- |
| SYSTEM_DESCRIPTION.md | Components, data flows, data classes, trust boundaries, roles. Where an auditor starts. |
| CONTROL_MATRIX.md | Criterion → control → implementation → test → evidence → status. |
| RISK_AND_VENDORS.md | Risk register and third-party inventory. |
| POLICIES.md | Policy set and the incident response runbook, each with owner and review date. |
| EXECUTION_LOG.md | What was and was not done, decisions, and the open gaps. |

Scope decision: Security (mandatory), Availability, Processing Integrity and Confidentiality are in scope. Privacy is in scope only for visitor chat and contact text, because the product stores no accounts or payments. Reasons are in SYSTEM_DESCRIPTION.md.

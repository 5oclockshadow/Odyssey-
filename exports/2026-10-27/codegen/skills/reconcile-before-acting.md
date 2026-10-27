---
name: reconcile-before-acting
description: Supervise automated work (agents, CI, deploy pipelines, job queues, release gates) by treating every reported status as a claim and reconciling it against observed reality before acting. Use when results come back from another agent or system ("passed", "deployed", "promoted", "done"), when state looks inconsistent (history says one thing, the live system another), after restarts or concurrent approvals, or when asked to "check what actually happened", "verify the agent's work", or "why does this say X but Y is running".
---

# Reconcile before acting

Automated systems report what they *think* happened. Your job is to establish what *did* happen, then act. Most bad outcomes come from acting on a report: approving work that only "passed" because nothing tested it, building on a release that silently reverted, re-running a fix for a problem that was never the real cause.

## The loop
1. **Collect the claims.** What did each system report? (job status, test count, "saved N files", "promoted", the version it says is live)
2. **Observe the reality independently**, with a different instrument from the one that made the claim:
   - Files: do they exist at the expected path, non-empty, newer than the job start? Anything written *outside* the expected paths?
   - Behaviour: call the endpoint, run the test directly, load the page. "Tests passed" ≠ "the feature works" unless a test exercises the feature.
   - Live state: what version/hash is actually serving? Does the pointer (symlink, tag, DNS, config) agree with the history log and the running process?
3. **Diff claims against reality.** Write the mismatches down explicitly. Typical ones:
   - passed + 0 outputs, or outputs in the wrong place (nested path, repo root, extra files)
   - verified + the change has no test of its own
   - "promoted" in history but a different version is serving
   - two systems each believing they own the current state
   - an empty error message hiding a timeout or crash
4. **When the mismatch is unexplained, stop and investigate before acting.** Read the history/audit log in time order; line up timestamps across systems; look for overlapping operations. Do not "fix" until you can state the cause in one sentence.
5. **Act on the cause, not the symptom**, and leave a guard so it cannot recur silently (a test, a lock, a precondition check, a refusal of empty/no-op work).
6. **Report with evidence**: claim, observation, cause, fix, guard. Say what you did not verify.

## Patterns worth recognising (any stack)
| Symptom | Usual cause | Guard |
|---|---|---|
| "Passed" but nothing changed on disk | output unnamed/misnamed, writer skipped it | declare expected outputs; missing output = failure |
| Work landed in the wrong place | relative path ambiguity, nested working dirs | absolute/expected paths; stow anything off-target |
| "Verified" change is broken | the change shipped without its own test | refuse changes without a test of the new behaviour; smoke-test before recommending |
| A good release was rolled back | two state-changing operations overlapped (a restart during another's health watch) | one lock around promote/rollback; second caller gets "busy" |
| A later approval silently undid an earlier one | whole-state swaps built on an old base | rebase onto current at approval time, re-verify |
| The same fix proposed again and again | the "fix" was a no-op; the real cause is elsewhere | refuse no-op changes; one attempt per issue per period |
| History and live state disagree | interleaved writes, or a pointer updated by a different actor | treat the running process's own report (hash/version) as ground truth; reconcile the log |
| Your own tooling killed your own process | pattern matching too broad (e.g. `pkill -f` on a string your command contains) | kill by PID or an anchored pattern |
| Monitor crashed during a restart | non-JSON / connection refused mid-restart | monitors treat parse errors as "restarting", not failure |

## Rules
- Never approve, promote or build on top of a result you have only read about.
- Prefer moving (stowing) to deleting while investigating; evidence is easier to keep than to recover.
- Serialize anything that changes shared state; make overlap a visible error, not a silent race.
- One question to the human when a decision is genuinely theirs, with your recommendation, after the facts are established.

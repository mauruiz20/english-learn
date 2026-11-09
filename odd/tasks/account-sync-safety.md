# Account sync safety

Objective: prevent unintended account synchronization and preserve sessions during temporary refresh failures. Branch: `fix/account-safety` (base `f5e9b5c`).
Delivery: ask-on-risk; forecast approximately 250 authored changed lines, one security work unit. Runner: mobile Jest, lint and TypeScript; no remote operations.

## Specs

S1. Implement the authorized plan: "ok let's implement with ODD + engram the plan". For the account-safety slice, reject deletion reauthentication with a different account without synchronizing or deleting either account. End the unintended sign-in, preserve local progress and sync metadata, and keep ordinary sign-in and same-account deletion working. Checks: controller public-interface regression tests, including session and coordinator effects.
S2. Preserve the signed-in account and unsynchronized progress when a sync-triggered refresh fails temporarily (network failure, HTTP 503 or HTTP 429). A later sync can retry; a definitive HTTP 401 still ends the session. Checks: runtime public-interface tests using the real session, coordinator and sync engine, with fake transport/storage.
S3. Honor "I mean ODD" and the approved Codex worker substitution. Use test-first development, existing helpers and neutral Spanish UI copy; do not add runtime AI/network services, change API contracts, migrate or delete learner data, or work on Android, off-site backups or currency. Observe focused RED before fixes, GREEN afterwards, lint/typecheck and independent verification because this slice touches authentication (Risk: item 2) and asynchronous ordering (item 4). Preserve existing unrelated files. Remote publication and Pi access are not part of this local slice.

## Tasks

- T1 [S1,S3] inline; complete; observed wrong-account RED then focused GREEN and independent isolation probe PASS; commit pending.
- T2 [S2,S3] inline; complete; observed network/503/429 RED then focused GREEN, unauthorized control and independent retry probes PASS; commit pending.
- T3 [S1-S3] delegated verification; complete; high-risk item 2 (auth/account isolation), item 4 (sync ordering); S1-S3 PASS in isolated probes, full pnpm check PASS, parent final focused 22/22 PASS; commit pending.
- T4 [S1-S3] inline; pending; normalize, record proof, commit coherent security work unit and follow native review consent if applicable; commit pending.

## Log

L1. Original user request: "ok let's implement with ODD + engram the plan".
L2. Workflow correction: "I mean ODD if you search gentle-ai you will see it, gentle-ai now recommends people to use ODD (Organic Driven Development) instead of SDD".
L3. User approved available Codex agents and then the session-specific gpt-6-luna/high explorer/writer and gpt-6.1-sol/medium verifier assignment with "yes". Installed configuration names an unavailable gpt-6.1-luna; no global config edit authorized.
L4. Local baseline confirmed: develop f5e9b5c; feature branch created, untracked `Claude outputs/` preserved. Read-only mapping completed. Parent spot check corrects handoff: the explicit sync request is in the wrong-account branch, not all same-account deletion callbacks. Removing that request alone would leave the unintended account signed in, so rejection must also stop sync and end that sign-in.
L5. The broader approved plan continues after this slice with release stability and one A1 learning-effectiveness slice. The specific flaky WebKit test and the reported Spanish-guard false positive for "descortés" have not yet been identified from local evidence. No live CI, deployment or background job state is claimed.
L6. Next: observe T1 and T2 failing regressions before editing production source; mirror this full document in Engram at `odd/account-sync-safety/tasks` and read back both copies.
L7. RED observed: focused controller/runtime Jest run failed 4 tests (wrong-account sync and network/503/429 account loss), with 16 passing controls. Minimal source fixes then yielded 20 passing tests in both suites. Typecheck caught the new fixture's missing Clock.today; corrected the fixture before rerunning. No production source workaround.
L8. Own checks: account/auth/sync suite 149 tests in 17 suites passed; final focused spot check 20/20 passed. Mobile lint and typecheck passed after using the domain localDate constructor in the fixture. Prettier normalized every changed source/doc before independent verification. Authored forecast remains below 250 lines. Next: isolated independent S1-S3 probes and full pnpm check; these may take several minutes and start local test servers, but no deployment or external data mutation is authorized.
L9. Independent verifier: S1-S3 PASS; isolated candidate probes 6/6, baseline four expected failures and two passing unchanged controls. Rejected wrong-account command preserves SHA256 of progress/cursor/device state; active runtime triggers cannot sync afterward. Approved full pnpm check passed (1557 mobile Jest, 97 mobile script, 927 package tests), content validation/corpus/API generation current. Initial sandbox server-test stall resolved by approved execution, not source changes. Exact scratch pnpm failed ENOEXEC; installed Jest equivalent passed 70 tests/7 suites. Browser E2E not run.
L10. Adopted both independent runtime probes as permanent regression tests, removed probe logging and formatted. Parent spot check: final focused 22 tests PASS; final mobile lint/typecheck PASS. Production source unchanged since independent verification; full check preceded adding these two already-passing probes. Forecast revised to approximately 300 authored lines, still under the review-slice heuristic. Next: coherent work-unit commit and native assessment/consent; no push, merge or publication in this local slice.

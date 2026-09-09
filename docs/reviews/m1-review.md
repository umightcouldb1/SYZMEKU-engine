# Big SYZ M1 — review before merge

M1 is implemented on **codex/m1-isolation-context-foundation**, based on **7bf9fb0fc590fa8ea16143a2310fa8bd9c034c26**. This is a review candidate, not a deployed release. Production migration, merge, deployment and M2–M6 are outside this delivery.

## What changed

The existing 26 personal Core models now require authenticated ownership. An operator can inspect and operate only their own personal Core records. Missing scope, spoofed owners, foreign record IDs/references and unsafe bulk/cross-collection operations are rejected. The security-only checkpoint **dae2ef9e128e6419c607a98b5b457a52505fa3b6** was committed before the context schema and UI work.

The shared context service extends LifeContext, SignalEntry, StrategicMemory, Memory and Task. Legacy mentor/onboarding endpoints adapt to these same authorities. It adds cross-domain goals and observations without requiring wellness input, context/fact correction controls, transactions, revision conflict handling and privacy invalidation. The existing timer remains one session-bound personal operator timer; historical active flags do not authorize boot restoration. No second scheduler or domain collection was added.

The implementation contract is incorporated in docs/master-build-spec.md §15. Earlier aspirations in that document do not imply M2–M6 implementation. New personal writes/jobs are opt-in via CORE_CONTEXT_WRITES_ENABLED=true; its default is paused. No environment setting was changed in production.

## Validation results

| Check | Result and boundary |
| --- | --- |
| M1 fixtures | 22 test groups pass against disposable MongoDB replica sets. No production database/server is imported. |
| Two-user isolation | Anonymous/role restrictions, owner spoofing, record IDs, memory/context, kernel history, summaries, jobs, boot restore, references and direct operations on all 26 models covered. |
| Actual kernel persistence | Manual evaluation, authenticated background cycle and medium-urgency task/action writes pass. This test exposed and fixed circular history payloads by detaching snapshots; action policy was not expanded. |
| Privacy | Fact correction, known derived cache/history invalidation, no legacy/onboarding/client-cache resurrection, no in-flight conversation resurrection, missing-index refusal and write-pause behavior covered. |
| Non-wellness | A business goal and success measure survive a second authenticated session; no observation is fabricated. |
| Freedom Audit | Mocked checkout fixes ownership and configured price; unpaid/foreign checkout denied; real Stripe signature verification exercised with synthetic signatures; replay yields one entitlement; scoring/stage and ten-result retention preserved. |
| Social Command | Existing social harness passes (tokens, OAuth state, provider declarations, UTM/analytics, media checks, idempotency and schedule activation). HTTP role/provider/campaign access passes. Core deletion/write pause leaves Operations records/access and commerce intact. |
| Client build | Full Vite production bundle passes: 141 modules. npm test's syntax phase passed; its CLI config-loader step hit a Windows parent-directory sandbox error. Importing the same checked-in config and invoking Vite build with configFile:false succeeded. This is an environment workaround, not a changed build config. |
| Browser | Actual new component against real fixture APIs: create business goal, edit success measure, reload persistence, fact correction, deletion confirmation/cancel; desktop and 390px mobile visually checked, no captured console warnings/errors. In-app browser used after agent-browser could not connect. |
| Live commerce/provider execution | Not performed; no real charge, live webhook replay, social publish, OAuth mutation or external model call. |

The tests are executable through npm run m1:test, npm run social-command:test and the replacement technicalHarness.cjs. PR CI now runs the fixture gates before the existing build. No claim is made about a live deployment or full family usability study.

## Read-only production dry run

Captured **2026-09-09T15:43:27.379Z**. File: big-syz-m1-production-dry-run.json. The script read metadata/counts/index definitions only; it returned no customer payloads or owner IDs.

| Inspected personal collections | Records | Resolved owners | Unresolved owners |
| --- | ---: | ---: | ---: |
| memories | 1 | 1 | 0 |
| agentloopstates | 1 | 0 | 1 |
| Other 24 inspected collections | 0 | 0 | 0 |
| Total across these 26 collections | 2 | 1 | 1 |

**Production writes: 0. Ownership assignments: 0. Index changes: 0.** The one unowned historical agent-loop record stays restricted and is not assigned to the founder/current user. These counts are not a whole-database inventory and say nothing about commerce, Social or account totals.

The tool deliberately has no apply/backfill mode. Run an offline snapshot with npm run m1:dry-run -- --snapshot FILE --output FILE, or an approved read-only database inventory with --uri-env VARIABLE --read-only. URI values must not be passed in command arguments. Future ownership resolution requires reliable evidence and separate migration review; none is guessed here.

## Schema and indexes

No new physical domain model. Existing owner fields retain their userId/user_id names; previously global personal models add required userId ObjectId ownership. All 26 disable automatic index creation.

| Schema | Added/changed fields |
| --- | --- |
| LifeContext | schemaVersion, revision, writeSequence, legacySuppressedAt; preferredName/lifeStage/mentorStyle/narrative; supportAreas/values; goal subdocuments with IDs, description/domain/successMeasure/status/confirmed/source/targetDate; sourced constraints/resources/obligations/relationships with IDs, kind/hard/validUntil; noncanonical legacyIntake. Old fields retained. |
| SignalEntry | schemaVersion, domain, observationType, value, occurredAt, source/sourceId, confirmed, legacyId, energy/mood; existing sleep/stress/symptoms/notes retained. |
| StrategicMemory | schemaVersion, revision, source/sourceId, confirmed, legacyId. |
| Memory | schemaVersion/revision and stable IDs for newly persisted conversation turns; canonical context is projected rather than duplicated here. |
| Task | title, protocol_id, legacyId; referenced protocol ownership checked. |
| History | contextInvalidatedAt on KernelSnapshot, KernelCycle, ActionExecution, AlertRecord, SystemExecution, ProtocolExecutionRecord. |
| AuditLog | Existing ai_gateway event category accepted; no new audit store. |

Production already has the required unique LifeContext.user_id and Memory.userId indexes. Their presence is checked before context writes, which fail 503 if metadata is absent/unreadable. Existing AgentLoopState singletonKey and AlertRecord fingerprint uniqueness remain; new keys include ownership. New declared owner indexes on previously global collections are **not** installed by this PR. Review owner+time/query indexes separately if data volume demands them. SourceId retry deduplication is serialized through LifeContext, with no new production unique index.

## Deployment risk and rollback

1. **Database prerequisite:** transactions require a replica set/transaction-capable Mongo deployment. Fixture transactions pass; production transaction execution was deliberately not probed with writes. Verify staging readiness and index-metadata permissions before enabling writes.
2. **Write pause:** unless CORE_CONTEXT_WRITES_ENABLED=true, personal writes/jobs return 503. Scoped reads, commerce and Social remain available. Rollout must deliberately account for that behavior.
3. **Visible privacy effects:** context/fact correction clears conversation and known derived recommendation tasks and redacts summaries/history payloads. History IDs/timestamps/statuses remain. Full context deletion removes personal tasks/systems/protocols and legacy mentor data; identity, purchases, Audit results, Social records and administrative DataRequest records remain. The empty suppression marker prevents fallback. Backups and third-party provider retention are not purged by M1.
4. **Legacy data:** M1 does not migrate owned legacy mentor stores into canonical models. The inspected production legacy collections were empty, but staging/other databases may require separately reviewed migration. Unowned history remains restricted.
5. **Deferred gaps:** full pattern dependency invalidation, model/router improvements, PermissionGrant/approval state machine, Audit import and multi-user autonomy are not implemented. Existing provider-enabled /core/agent analyzeMode defect remains deferred to M3. Existing internal urgency policy is not a grant system.

**Safe rollback after any M1 use:** keep this M1 code revision, set CORE_CONTEXT_WRITES_ENABLED=false, drain/restart all app processes to terminate in-flight work/timers, and verify scoped reads plus denied writes/jobs. Preserve LifeContext suppression markers and redacted payloads. Do not restore pre-correction snapshots or legacy writers. Do not roll back to pre-M1 **7bf9fb0**. The security-only checkpoint above is evidence of the ordering gate, not a supported downgrade after M1 data exists. Any code rollback must preserve ownership guards, canonical readers and privacy/write-pause behavior in a reviewed patch.

No production configuration, migration, merge or deployment was performed. Separate approval is required for those steps.

## Exact changed files

60 paths relative to repository root, compared with the base above (including new files):

- .github/workflows/verify-and-deploy.yml
- .gitignore
- client/src/Dashboard.jsx
- client/src/OperatorConsole.jsx
- client/src/components/CoreContextPanel.css
- client/src/components/CoreContextPanel.jsx
- docs/master-build-spec.md
- docs/reviews/m1-production-dry-run.json
- docs/reviews/m1-review.md
- package-lock.json
- package.json
- server/logic/actionKernel.js
- server/middleware/authMiddleware.js
- server/models/ActionExecution.js
- server/models/AgentLoopState.js
- server/models/AlertRecord.js
- server/models/AuditLog.js
- server/models/BehavioralRhythm.js
- server/models/ColorProfile.js
- server/models/DataRequest.js
- server/models/EmotionalPattern.js
- server/models/KernelCycle.js
- server/models/KernelSnapshot.js
- server/models/LifeContext.js
- server/models/LoopStatus.js
- server/models/Memory.js
- server/models/MentorMessage.js
- server/models/MentorProfile.js
- server/models/MentorSignal.js
- server/models/MentorTask.js
- server/models/Protocol.js
- server/models/ProtocolExecutionRecord.js
- server/models/SensoryProfile.js
- server/models/SignalEntry.js
- server/models/StrategicMemory.js
- server/models/SymbolicInterest.js
- server/models/System.js
- server/models/SystemExecution.js
- server/models/Task.js
- server/models/UserProtocolState.js
- server/models/coreOwned.js
- server/routes/API/coreRoutes.js
- server/routes/API/mentorSystemRoutes.js
- server/routes/coreContextRoutes.js
- server/routes/index.js
- server/routes/memoryAnalyzeRoutes.js
- server/routes/memoryRoutes.js
- server/routes/onboardingRoutes.js
- server/scripts/migrateCoreContextV1.cjs
- server/scripts/technicalHarness.cjs
- server/services/coreContextService.js
- server/services/coreScopeService.js
- server/services/lineageMemoryService.js
- server/services/mentorCompatibilityService.js
- server/tests/commerceRegression.test.cjs
- server/tests/coreContext.test.cjs
- server/tests/coreMigration.test.cjs
- server/tests/coreScope.test.cjs
- server/utils/asyncRouter.js
- server/utils/requestContext.js

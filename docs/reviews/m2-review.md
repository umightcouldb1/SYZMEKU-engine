# M2 implementation — code review report

Branch: codex/m2-pattern-intelligence. Base: f051abecc137a049dc68e2e890004307bb677c51. The PR/head identity is recorded in the final delivery report after publishing. No merge, deployment, activation, production index operation or M3 work is authorized.

M2 makes recorded patterns an owned Core capability, with deterministic evidence counts and confidence, explicit evaluation, user feedback and source invalidation. It preserves the two approved clarifications: versioned windows default to28 days without dynamic fitting, and mixed contradictions prevent promotion under the current heuristic without proving the hypothesis false.

## Verification

| Check | Result |
|---|---|
| M2 rules, lifecycle, privacy, integration and consumer fixtures | PASS —46 tests |
| Existing M1 isolation/context/loop/gate/commerce fixtures | PASS —35 tests |
| Social Command harness | PASS |
| Freedom Audit authentication | PASS —8 tests |
| Headless Chrome + real fixture HTTP + disposable replica set | PASS — mobile rendering, counts/contradictions, no probability claims, dismissal, session reload, corrected-source suppression, nonfounder gate and no browser exceptions |
| Big SYZ production bundle | PASS — Vite API with the checked-in configuration; CLI config bundling was blocked by Windows sandbox ancestor-directory permissions |
| Freedom Audit production build | PASS |
| Server syntax checks and git diff whitespace check | PASS |

No live checkout, Stripe purchase, social provider publishing or customer data was used. Google sign-in behavior was not changed; existing auth fixtures and builds passed. The browser uses fake accounts in a disposable local replica set, not the real founder account. CI repeats the normal production build command in Linux.

## Exact schema, indexes and rules

The authoritative strict schema is server/models/Pattern.js and the full contract is docs/m2-pattern-intelligence.md. Pattern stores immutable ownership, semantic hypothesis identity/key version, family/domain/rule methodology, source refs and revisions, independent episodes, raw support/contradiction counts, windows, categorical confidence, explicit contradiction review, freshness/source epoch, lifecycle/feedback, suppression and invalidation/retirement metadata. Source text is resolved on read.

New schema fields stay in existing LifeContext, SignalEntry, Task, StrategicMemory and Memory authorities. EmotionalPattern is not repurposed. Explicit structured user observations and task intentions/outcomes provide evidence. Conversation, durable facts and reasoning/execution history remain context rather than independent votes; no legacy or imported source is retroactively certified.

New index plan (none created in production):
- patterns: pattern_owner_hypothesis_uq {userId:1,hypothesisKey:1}, unique.
- patterns: pattern_owner_state_updated {userId:1,state:1,updatedAt:-1}.
- signalentries: pattern_signal_owner_time {userId:1,occurredAt:1,_id:1}.
- tasks: pattern_task_owner_due {userId:1,'intent.dueAt':1,_id:1}.
- Existing LifeContext.user_id and Memory.userId unique indexes remain prerequisites and are not modified.

Method pattern-rules-v1 constants:28-day default discovery/maintenance;14-day prospective confirmation beginning next UTC date; seven-day minimum elapsed confirmation; three independent supporting episodes over two dates initially and later; 24-hour sequence/intervention horizon; integer contradiction promotion rule 3*C <= S+C; max500 source rows,400 episodes,50 owned Patterns,20 evaluated rules,8 predicates,10 enum values,4 related domains,1200 refs,20 feedback entries;25-ref pages;20/default25/max Pattern pages; five guidance Patterns;60-second persisted evaluation throttle;24-hour maximum presentation freshness, shortened by window expiry. A dedicated at-least32-character HMAC secret is required; key drift fails closed. No LLM call is required by evaluation.

## Evidence and privacy

Transport identity conflicts return409. Known source roots and exact normalized structured event copies deduplicate. Model/import provenance is not eligible; unknown legacy metadata stays context-only. Same-date counts cannot satisfy two-date thresholds. Sequences count nonoverlapping episodes and require explicit coverage to interpret absence. Open tasks alone remain unknown. Repeated task completion preserves its original timestamp. Intervention comparisons require recorded paired observations and comparable units; no causal claim is inferred.

Source mutations advance the owner evidence epoch. Correction/deletion conservatively scrubs all owned Pattern hypotheses, rules, refs, episodes and feedback text in the same transaction, retains safe suppression identity and retires nondismissed records. Stale reads reveal no former text. These privacy hooks operate even with M2 disabled. Full context erasure also deletes Pattern tombstones. New source data can contradict a Pattern even when that source was not previously referenced, so staleness is owner-wide at the initial bounded scale.

GETs, evidence pages, consumers and plan preview are zero-write. Model output is checked against source epoch and Pattern revisions before persistence/response, including errors. Raw source text is never an instruction. Pattern-derived conversation has provenance citations; source edits clear it using the existing M1 privacy path. Client refresh generations discard outdated asynchronous results.

## Gates and operational limits

CORE_PATTERN_INTELLIGENCE_ENABLED defaults OFF; CORE_PATTERN_USER_IDS defaults empty. Both are required for output. Mutation also requires M1 CORE_CONTEXT_WRITES_ENABLED and its exact approved account allowlist plus an active session. Role alone never authorizes access. CORE_PERSONAL_EXECUTION_ENABLED is not changed or bypassed. Privacy maintenance is an internal authenticated transaction path, not a client bypass parameter.

Vercel config blocks automatic deployments only for this dedicated branch in both linked projects. Other branch behavior is unchanged. This is the only Freedom Audit configuration change and does not change product/auth/checkout code. The existing Render workflow remains manually dispatched and was not dispatched.

Prerequisites before a later approved release: review the new index plan and target query performance; explicitly provision approved indexes/new collection; verify transaction and index metadata permissions; provision a dedicated identity key; review rollout flags. Tools never load .env or default to a production URI. No bulk backfill or inferred owner assignment is implemented. A bounded-window capacity overflow fails without classifying a selected subset.

## Risks and rollback

- Source correction intentionally retires more Pattern presentations than a fine-grained dependency graph would. This is conservative and can require explicit review of previously useful hypotheses.
- Signal/Task metadata is new. Historical records without adequate identity/intent stay ineligible; a first founder screen may correctly have no supported patterns.
- Supported classification is a versioned heuristic, not statistical probability or causality. Sparse/unknown coverage is disclosed.
- New indexes and key provisioning are unperformed production prerequisites. Query limits deliberately favor safe failure over unbounded scans.
- Existing kernel/provider architecture is retained. This does not solve M3 provider routing or M4 permission grants.
- The browser harness needs installed Chrome; CI uses the Linux runner's Chrome. No extra browser automation dependency or production login is required.

After any later activation, disable M2 gates and drain/restart processes to pause presentation/evaluation. Keep M1 founder writes at their approved state unless separately paused. Retain ownership guards, privacy invalidation, source epochs and source data. Do not deploy pre-M2 code that ignores existing Pattern derivatives, restore old context snapshots, drop indexes, migrate history, recreate legacy writers or enable execution. Use a reviewed forward fix when necessary.

## Exact changed files (44)

- .github/workflows/verify-and-deploy.yml
- client/src/Dashboard.jsx
- client/src/components/CoreContextPanel.jsx
- client/src/components/PatternObservationForm.jsx
- client/src/components/PatternPanel.css
- client/src/components/PatternPanel.jsx
- docs/m2-pattern-intelligence.md
- docs/master-build-spec.md
- docs/reviews/m2-review.md
- freedom-audit/vercel.json
- package.json
- server/logic/patternRules.js
- server/models/LifeContext.js
- server/models/Memory.js
- server/models/Pattern.js
- server/models/SignalEntry.js
- server/models/StrategicMemory.js
- server/models/Task.js
- server/models/coreOwned.js
- server/models/patternSourceFields.js
- server/routes/API/coreRoutes.js
- server/routes/coreContextRoutes.js
- server/routes/index.js
- server/routes/memoryAnalyzeRoutes.js
- server/routes/patternRoutes.js
- server/scripts/provisionPatternIndexes.cjs
- server/scripts/verifyPatternPrerequisites.cjs
- server/services/coreContextService.js
- server/services/patternCapabilityService.js
- server/services/patternEvidenceService.js
- server/services/patternIntelligenceService.js
- server/services/patternInvalidationService.js
- server/services/patternPresentationService.js
- server/services/patternSourceService.js
- server/tests/coreFounderGate.test.cjs
- server/tests/coreScope.test.cjs
- server/tests/patternBrowser.cjs
- server/tests/patternConsumers.test.cjs
- server/tests/patternFixture.cjs
- server/tests/patternIntegration.test.cjs
- server/tests/patternLifecycle.test.cjs
- server/tests/patternPrivacy.test.cjs
- server/tests/patternRules.test.cjs
- vercel.json

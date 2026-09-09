# M2 Pattern Intelligence — implementation contract

Status: implementation for code review only. No merge, deployment, production indexes, M2 activation or M3 is authorized. Base: deployed M1 `f051abecc137a049dc68e2e890004307bb677c51`.

The architecture and the following clarifications are approved: 28 days is the initial discovery/maintenance default of a versioned methodology, not a universal definition of a human pattern. The one-third contradiction ceiling is only a conservative v1 promotion heuristic. Mixed evidence does not prove a hypothesis false. No windows are fitted to produce favorable results.

## Authorities and service boundaries

`Pattern` is the only new domain authority. LifeContext remains human context; SignalEntry remains observations; StrategicMemory remains sourced facts/insights; Memory remains conversation; Task remains tasks; existing kernel/action models remain history. EmotionalPattern remains self-report legacy data and is never imported as detected evidence.

The logical Pattern service comprises deterministic rules, capability, source validation, evidence resolution, evaluation/lifecycle, presentation and privacy modules. It is consumed by the actual primary `/core/analyze` lineage route, direct Mentor/Recommend routes and the existing planner branch. `/core/patterns/plan-preview` is a read-only explicit planning draft. Neither evaluation nor consumption invokes Action Kernel, creates tasks/facts, runs protocols, starts timers, or imports provider data.

Automatic candidates are limited to boolean outcomes in explicitly recorded structured events. Users can propose all four rule families through the hypothesis UI/API. No optional LLM candidate generator is needed for correctness and none is enabled in this release. Conversation, generated summaries, facts and reasoning history are context, not additional event votes. The current implementation counts structured user-reported SignalEntry events and explicit Task intention/outcome episodes. It does not retroactively certify history or infer human outcomes from an execution success flag.

## Schema

The strict schema is `server/models/Pattern.js`. Fields: owned userId; schemaVersion/revision; primary/related domains; family; hypothesis text; hypothesisKey; identityKeyVersion; proposalOrigin; typed rule and methodVersion; supporting/contradictory/context refs; evaluation episodes; observationWindow; counts; confidence/reasons; coverage; explicit contradictionReview; state; freshness; prospective-confirmation bit; evaluated source epoch/time; expiry; evaluation digest; bounded feedback; suppression; invalidation and retirement metadata; timestamps.

Refs contain authority, recordId, optional itemId, sourceRevision, provenance root and occurrence/recorded time. Source text is resolved on read, never copied into evidence refs. Nested references and goal IDs are validated inside the owner scope. Source corrections conservatively remove the rule as well as explanation text because predicate values themselves may repeat deleted private information. Null rule means a scrubbed record; it cannot be reopened without a new explicit hypothesis evaluation. Dismissal HMAC tombstones survive source edits, but full personal deletion removes them.

LifeContext gains patternEvidenceRevision and lastPatternEvaluationAt. SignalEntry gains revision, eventKey, provenance and a strict structured event (subject, typed values, unit, intervention phase/key, coverage, optional owned task ref). Task gains revision, goalId, intent (deadline, confirmation time, subject, identity) and pattern derivation refs. StrategicMemory gains provenance/derivation refs. Generated conversation turns may carry Pattern ID/revision/epoch citations. No historical metadata is backfilled.

Existing records without explicit event provenance are context-only. Public clients cannot assign trusted roots, source revisions, system provenance or original creation times. M2 structured ingestion accepts only explicit user reports; generated/import sources are rejected. Typed values and predicate operators are validated; textual labels remain self-reported data, not verification.

## Method and all operational constants

| Setting | Value |
|---|---|
| Method | `pattern-rules-v1` |
| Discovery/maintenance default | 28 days, registry-owned and immutable for existing hypotheses |
| Prospective confirmation | Next UTC date after lock; 14-day window |
| Earliest supported confirmation | 7 days after confirmation start |
| Minimum initial and later supporting units | 3 independent episodes over at least 2 dates in each window |
| Contradiction promotion check | Integer `3*C <= S+C`, never a probability |
| Sequence/intervention horizon | 24 hours |
| Related domains | At most 4, plus primary domain; same recorded subject/conditions required |
| Predicates/enum values | 8 predicates, 10 enum values per predicate |
| Source scan cap | 500 combined eligible-window source rows; limit+1 detects overflow |
| Episode cap per Pattern | 400; overflow rejects without favorable sampling |
| Pattern cap | 50 per owner, including suppression records; no automatic eviction |
| Evaluation rule cap | 20; explicit subset evaluation available |
| Evaluation throttle | 60 seconds, transaction-serialized persistent timestamp; in-process overlap guard |
| Evidence refs / feedback history | 1200 combined refs / last 20 feedback requests |
| Evidence page / Pattern page | 25 refs; default20/max25 Patterns |
| Guidance Pattern limit | 5 |
| Presentation expiry | Earliest source-window boundary or 24 hours |
| Hypothesis/feedback text bounds | 1000 characters each |
| Identity secret | Dedicated HMAC key, at least32 characters; deployment key drift pauses evaluation |

Future family/domain windows require an additional reviewed registry method. Existing semantic identity cannot silently acquire a different methodology. Changing the HMAC key also fails closed rather than resurfacing dismissed hypotheses under new identities.

Recurrence counts distinct matching events. Sequence greedily matches the earliest unused later B within24h, with no shared event reuse. Absence counts against a sequence only with explicit complete coverage. Goal consistency requires an owned goal and contemporaneous explicit deadline; open alone is unknown. Repeated completion preserves the original completedAt and revision. Intervention response requires matching before/after units and an explicitly recorded episode; overlapping interventions are unknown. It reports association, never causality.

Confidence is insufficient/tentative/supported, distinct from candidate/active/disputed/dismissed/retired lifecycle and current/stale freshness. Supported needs prospective confirmation and contradiction review. Too much mixed evidence blocks promotion/demotes to disputed; it does not declare the pattern false. User agreement adds no evidence. Dismissal never automatically reactivates: materially new later support only marks it eligible for deliberate review/reopen.

## Privacy, consistency and reads

Canonical source mutations advance a per-owner evidence epoch under M1's transaction anchor and mark Patterns stale. Correcting/deleting a source conservatively scrubs all owned Pattern hypotheses, rules, refs, episodes and feedback content; retires nondismissed records; clears existing derived conversation/history via M1; and retains only safe metadata/suppression identity. This maintenance path works with M2 OFF and still requires owner-scoped M1 write authorization.

GET/list/detail/evidence/preview never anchor context, evaluate, create records or repair stale data. They return safe stale status without old text. Reads check epoch and Pattern revisions. Guidance checks stamps before storing and returning model output; concurrent corrections produce409. Pattern-bearing endpoints are private/no-store. The browser clears source-dependent state and rejects older asynchronous refreshes. No vector store, client persistent Pattern cache or independent scheduler exists.

Personal schemas disable automatic index and collection creation to avoid DDL races with transactions. Before Pattern records exist, legacy M1 direct model fixture paths retain compatibility. Once derivatives exist, direct source writes outside canonical transactions fail closed. Typed event sources also reject a transaction path that did not advance the evidence epoch. All app source mutations use the canonical service.

## APIs

Under `/api/core/patterns`: GET capability, list, `:id`, `:id/evidence`, plan-preview; POST evaluate, hypotheses, `:id/feedback`. Query pagination is bounded; all records resolve in authenticated scope. Additional canonical endpoints: GET/PATCH/DELETE `/api/core/signals/:id` and PATCH `/api/core/tasks/:id/intent`. Corrections require source expectedRevision (DELETE uses If-Match). Feedback requires action, requestId and expectedRevision. No client-owned owner/method/count/state fields are accepted.

The UI includes all four hypothesis families, structured non-wellness event reporting, manual intervention/coverage reporting, task intention and outcome links, direct source review/correction, support and contradiction pagination, confidence/window explanations, dismissal/reopen and read-only plan preview. Alerts are accurately labeled Alerts. Kernel substring overlap no longer claims evidence-backed repeated-pattern authority or promotes a fact.

## Gates and release prerequisites

M2 output requires `CORE_PATTERN_INTELLIGENCE_ENABLED=true` and the exact owner ID in a strictly parsed `CORE_PATTERN_USER_IDS`. Missing, empty, wildcard or malformed values authorize nobody. Evaluation/feedback additionally require M1's write gate/allowlist and an active session. Roles, Google identity and commerce entitlements do not grant M2 approval. Personal execution still independently requires its existing flag, which remains false.

No production configuration was modified. M2 defaults OFF/unset. Later founder activation must use the already approved existing founder ID, not a new account. The implementation creates synthetic fixture accounts only in disposable local replica sets.

Required new indexes:

| Collection | Name | Keys | Unique |
|---|---|---|---|
| patterns | pattern_owner_hypothesis_uq | userId1, hypothesisKey1 | yes |
| patterns | pattern_owner_state_updated | userId1, state1, updatedAt−1 | no |
| signalentries | pattern_signal_owner_time | userId1, occurredAt1, _id1 | no |
| tasks | pattern_task_owner_due | userId1, intent.dueAt1, _id1 | no |

Retain LifeContext.user_id and Memory.userId unique indexes. There is no TTL/vector index. `m2:index-plan` prints definitions without connecting. Applying needs explicit PATTERN_INDEX_URI, --apply, --database and matching PATTERN_INDEX_APPROVED_DATABASE; conflicting definitions fail without dropping/replacing anything. Production application requires separate approval. `m2:prerequisites` uses the explicit URI and reports transaction/snapshot-read capability and readable required indexes without writes. Neither tool loads .env or defaults to MONGO_URI.

This PR's branch has automatic Vercel deployments disabled in both project configs to honor the no-deployment boundary. Other branches retain default behavior. See [Vercel's branch deployment configuration](https://vercel.com/docs/project-configuration/git-configuration). Render remains manual workflow_dispatch-only; this work does not dispatch it.

## Tests and rollback

Run `npm run m2:test`, `npm run m2:browser`, `npm run m1:test`, `npm run social-command:test`, `npm test`, and Freedom Audit tests/build. Browser fixtures use installed Chrome (override CHROME_PATH), the actual React components, authenticated HTTP and a disposable Mongo replica set. They never visit production. Pure rules use fixed clocks; production longitudinal evidence is never manufactured to obtain a supported result.

Rollback after a later approved activation: disable M2 output/evaluation, restart/drain processes, retain ownership/epoch/privacy code and all source data. Leave M1 founder writes at their existing approved state unless separately paused. Do not downgrade to code that ignores persisted Pattern derivatives, restore old source snapshots, recreate legacy writers, delete indexes, or globally enable execution. A reviewed forward fix is preferable. Key/index/transaction prerequisites and genuine longitudinal evidence remain separate release checks.

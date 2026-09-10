# M3 reasoning and planning implementation

Status: **draft PR / code review only**. The reviewed M3 design is implemented against deployed M1/M2 base `323b102039a11b21d2ca6448bd46cc392a65c387`. This change authorizes no merge, deployment, production indexes, M3 activation, data migration, personal execution, or M4 work. The production baseline remains founder-only M1 writes and M2 enabled, with personal execution disabled.

## One reasoning boundary

`reasoningRoutes` dispatches before lineage analyze and legacy Core routes. M3-enabled accounts use `reasoningService.generate` → `reasoningContextService.assemble` → purpose policy → `modelRouter.generateStructured` → `reasoningProviderService`. The response is parsed, strictly validated, ranked by the server, and revalidated against current scope/session/context before delivery. Once M3 dispatch occurs, errors never fall through to a legacy provider or reader. Other accounts retain existing M1/M2 routes; new reasoning endpoints are unavailable to them.

The assembler uses a read-only Mongo snapshot. It includes canonical LifeContext goals, constraints, resources, values/preferences; SignalEntry observations; confirmed StrategicMemory assertions separately from unconfirmed/derived hypotheses; Memory conversation with user/derivative types; owned Task state; supported Pattern DTOs from unchanged M2 logic; and nonredacted KernelCycle/ActionExecution metadata. It never reads ownerless history as a fallback. It never consumes saved ReasoningRecords as evidence.

Source references have authority, owned ID, revision and semantic kind. The composite digest includes actual selected source values, current M2 availability and the Pattern stamp. Wall-clock serialization fields and the transaction anchor's writeSequence do not make unchanged context stale. Equal source scope and goal selection yield equal digests across purposes. New/corrected input, expired Patterns, changed conversation, session revocation and withdrawn account approval are rechecked after model latency and before persistence/delivery. No database transaction spans a provider call.

Bounds: 50 durable entries, 100 observations from the last 28 days, 100 tasks, 40 retained conversation turns, 20 kernel cycles and 50 actions from the last 28 days, and the existing M2 maximum of five supported Patterns. Tasks explicitly linked to chosen goals precede other recent tasks; sources without canonical goal links use timestamp/ID ordering rather than guessed semantic linkage. Missing numeric wellness values remain absent. Context is limited to 64 KiB, request text to 8,000 characters. Budget reduction removes derivative history before ordinary sources, records omitted coverage, and retains goals, constraints and complete included Pattern DTOs. Required context that cannot fit returns 413.

Operation success and task completion do not establish human benefit. Cycle IDs remain available for provenance; duplicated history is not counted as independent support or a learned outcome score. Unknown capacity and outcome history remain unknown. No Freedom/Social data is imported.

## Goal authority, constraints and ranking

An explicit selected owned goal list is its priority order. A single active confirmed canonical goal may be selected implicitly; multiple unselected goals produce clarification without a provider call or initialization. Legacy goals without stable IDs require canonical saving first. Models cannot introduce a foreign goal or rank score.

Ranking is ordinal: selected goal order, resource feasibility, direct recorded evidence versus supported Pattern association versus unsupported proposal, referenced failed-operation caution, estimated effort, then a stable ID tie-break. It uses no revenue, retention, engagement or inferred urgency objective. Missing outcomes never count as failure. Recommendations remain proposals; factual Pattern cards/counts/confidence come from the verified DTO, never from model-invented labels.

**Conservative natural-language constraint boundary:** hard constraints remain authoritative until M1 correction. M3 cannot mechanically prove arbitrary prose constraints satisfied. Such constraints therefore make proposals require clarification. Only an exact, single execution-disabled/no-execution constraint is mechanically satisfied by this planning-only path. Compound constraints and uncertain feasibility stay unresolved. Expired resources and referenced failed operations also require clarification; no capacity or deadline is fabricated. This trades fewer falsely feasible plans for more clarification and is visible in the UI, not a silent override.

The UI asks whether a conflicting saved constraint changed. It displays a replacement editor and an explicit confirmation button. Confirmation fetches the latest constraint, checks it still matches, and PUTs the replacement through existing M1 `/core/context` with `expectedRevision`. M3 has no canonical correction writer. The existing M1 transaction clears onboarding/legacy projections and conversation, redacts ReasoningRecords, and establishes the new constraint. Clients clear prior advice and regenerate explicitly. A changed hard constraint can still require clarification if its new feasibility is unknown; the old text is not reused.

## PlanV1 and concise rationale

Strict candidates contain an ID, selected goal IDs, proposed description, known evidence/resource references, estimated effort band/basis/optional duration range, proposed success criteria and uncertainty. Unknown fields, fabricated references, model scores, confidence overrides, and chain-of-thought fields fail validation.

Planner and agent-plan return PlanV1 with title, goal linkage, 1–12 steps, step dependencies, existing owned task references, effort, success criteria and uncertainty. Missing/self/cyclic dependencies and duplicate IDs fail validation. Constraint refs, source stamp, feasibility and selected goal order are server-added. Existing task refs are references only. No task, protocol, timer or execution record is created by planning or saving. A saved draft can be edited with a revision check and the same strict reference/DAG validation; edited plans are labeled user-authored and require feasibility review.

Public rationale is a bounded explanation of ordering factors and recorded references, not private chain-of-thought. Generated prose is explicitly presented as a proposal, not as verified entailment merely because it contains a valid reference. A future rollout still needs human review of real provider output quality; deterministic fixtures do not prove that all generated prose is semantically sound.

## Route reconciliation

| Surface | M3 behavior |
|---|---|
| POST `/core/analyze` | Early single dispatcher; canonical reasoning plus existing explicit conversation append. Only validated concise public summary and typed refs enter Memory. |
| POST `/core/mentor`, `/core/recommend` | Same assembler, provider and strict result. Unsaved, zero-domain-write previews. |
| POST `/core/agent/plan` | Planner-only adapter. Prompt wording cannot select execution. |
| POST `/core/reasoning/preview` | Explicit mentor/recommend/planner/agent-plan purpose; no persistence. |
| POST `/core/reasoning/nodes/:node` | Pure Mentor, Recommend, Planner and Sentinel perspectives share authority/validation. Unknown/protocol-execution nodes are rejected. |
| GET `/core/patterns/plan-preview` | M3 canonical goals/Pattern read and explicit-generation message. No model or initialization. M2 fallback unchanged when M3 is off. |
| POST authenticated `/ai/intelligence`, `/ai/commander/intelligence` | Same personal contract. Commander retains local Ollama; ordinary declared cloud path uses Gemini. No local-to-cloud fallback. |
| POST `/vision/analyze` | Same assembler; transient image/video ≤1 million base64 characters; client context is not authoritative. No media or extracted fact is saved by this path. |
| POST `/onboarding` | Deterministic, bounded, unsaved reflection of explicit incoming choices. Labeled user-input reflection; no Pattern claim or private context import. Existing profile-context save unchanged. |
| GET `/core/reasoning/evidence` | Current owner-scoped typed source review, known manifest ref only, freshness checked. No arbitrary collection lookup. |
| `/core/agent`, `/core/agent/evaluate`, loops and execution kernel | Existing execution guard stays first. Not used by planning. Historical templates remain confined here. Narrow legacy key check and undefined analyzeMode are removed; shared router resolves credentials. |
| Public AI gateway, Academy automation, mentor data compatibility routes | Existing nonpersonal/adapter boundaries retained. No private assembler is introduced into anonymous traffic, commerce or operations. |

The shadowed later Core `/analyze` handler is removed; M3 OFF still reaches the previously effective lineage handler. Operator plan/build commands use the explicit planning endpoint. Dashboard and Operator render the shared result; the main panel supplies goal order, preview, generate-and-save, source review, saved guidance, archive/delete and explicit constraint correction. No execute/approve-permission control is introduced.

## Provider and errors

Canonical `GEMINI_API_KEY` and existing `Gemini_API_Key`/`Gemini_API_KEY` aliases are supported centrally. Distinct conflicting nonempty aliases fail closed without printing values. Purpose model aliases remain Mentor, Signal and Strategic as appropriate, with `DEFAULT_MODEL` fallback. Ollama uses its configured model/private URL and never falls back to Gemini.

One generation plus at most one schema-repair attempt uses the same snapshot and a 60-second combined provider deadline. Client disconnect cancellation is passed to the provider. Gemini's thought-marked parts are excluded. Provider bodies are capped at 256 KiB and structured guidance at 64 KiB. No unvalidated personalized streaming or raw-response fallback is returned.

All failures use `{ok:false,requestId,error:{code,message,retryable,retryAfterSeconds?}}`; successful legacy aliases project the one validated result. Missing key/local outage: 503. Invalid provider credential: 503, not a user-auth 401. Provider quota: 429 with bounded retry metadata. Timeout: 504. Invalid output/other upstream failure: 502. Stale context/revision conflict: 409. Foreign ref/unavailable account: 404. Invalid request: 400. Oversized required context: 413. Missing save indexes/M1 write pause: 503. Raw provider bodies/keys are never returned or logged by M3.

## ReasoningRecord and privacy

One new collection, `reasoningrecords`, stores schema/revision, required authenticated `userId`, purpose, draft/archive status, current/stale/redacted freshness, request key/hash, bounded request summary, selected goal IDs/order, generation and validation digests, typed source manifest, validated public guidance/embedded plan, provider/model/policy versions, timestamps and invalidation metadata. `autoCreate` and `autoIndex` are false. It is neither a fact store nor execution history.

Generate-and-save is explicit POST `/core/reasoning/records`; a client cannot post an invented provider response for trusted saving. Persistence additionally requires M1 founder write approval and verified index metadata. It uses the existing per-owner transaction anchor. Identical request-key replay returns the owned current artifact; different request content or stale/erased content returns 409. Concurrent same-key saves produce one record. Saved Pattern context contains IDs/revisions only; fresh evidence is hydrated from M2 on read rather than copied into a duplicate evidence store. Raw prompts, full source snapshots, media and private reasoning are not stored.

Conversation requests and explicit saved-guidance requests are separate HTTP actions. Conversation appends compute their postcommit validation baseline *inside* the append transaction; input digest still describes pre-generation evidence. They do not invalidate themselves. No route requests both types of persistence in one call.

GET list/detail are bounded, scoped and zero-write; list returns up to 25 most recently updated records. No automatic regeneration. Stale/redacted artifacts return metadata shells only. PATCH requires expectedRevision; DELETE is owner-scoped and has no Task cascade. Source corrections and erasure redact/delete artifacts and refs in the M1 transaction even with M3 OFF. Additions/feedback mark current artifacts stale. Evidence writers and relevant kernel/action history cannot bypass canonical transactions when saved derivatives exist. Browser responses are not cached in localStorage; privacy events clear advice/source displays and suppress in-flight stale UI responses.

Exactly two proposed non-default indexes:

| Name | Keys | Unique |
|---|---|---|
| `reasoning_owner_request_uq` | `{userId:1,requestKey:1}` | Yes |
| `reasoning_owner_updated` | `{userId:1,updatedAt:-1,_id:1}` | No |

`npm run m3:index-plan` prints this plan only; `--apply` is refused. CI/tests provision only disposable replica-set collections. Production provisioning needs separate release approval.

## Gates, validation and release prerequisites

`CORE_REASONING_RECONCILIATION_ENABLED` must equal `true` and `CORE_REASONING_USER_IDS` must contain only valid exact approved account IDs. Empty/malformed/wildcard lists grant nobody access; roles/request bodies do not bypass approval. Saved guidance/conversation additionally requires M1 writes and its account list. M3 never changes `CORE_PERSONAL_EXECUTION_ENABLED`. Environment examples default all new gates off; no secrets are introduced.

Automated commands: `npm run m3:test`, `npm run m3:browser`, `npm run m1:test`, `npm run m2:test`, `npm run m2:browser`, `npm run social-command:test`, both app builds and Freedom Audit auth tests. M3 fixtures mount the actual production route order against disposable two-user replica sets and use deterministic provider responses. Tests cover source parity, goal sovereignty, strict references/DAG/effort, zero-write previews, explicit persistence/replay/concurrency, revisioned editing, constraint supersession, complete erasure with M3 OFF, source/session/Pattern races, provider errors, ownerless quarantine, independent execution guards and browser reload/error/privacy behavior.

Before a separately approved rollout: exact-head review and green CI; transaction-capable Mongo and existing M1 ownership indexes; explicit creation/verification of only the two reviewed ReasoningRecord indexes; valid server-side provider configuration and reachable local provider if that path is used; off-first deployment/regression check; then approved founder-only M3 gate. Live provider semantics, production throughput, actual plan usefulness and production browser behavior remain release validation, not claims made by these fixtures.

Deployment risks: strict schema may reject weak model output after one repair; arbitrary hard constraints can require clarification; conservative correction invalidation clears saved guidance broadly; 64 KiB limits can refuse oversized required context; repeated freshness reads cost Mongo work; local commander routing can remain unavailable where Ollama is unreachable. No silent fallback weakens these boundaries.

Rollback: set M3 flag false, clear its allowlist and restart/drain in-flight processes; retain M1/M2 code, canonical ownership, suppression markers and ReasoningRecord privacy hooks. Do not restore pre-M1 snapshots or downgrade away privacy support after saved records exist. M1/M2 remain at their independently approved founder state and execution stays false. No migration/backfill/index drop is part of rollback.

Draft branch Vercel previews are explicitly disabled in both app configs; Netlify's existing build-ignore remains. Render deploy remains manual-workflow-only. Opening this draft PR is not release authorization.

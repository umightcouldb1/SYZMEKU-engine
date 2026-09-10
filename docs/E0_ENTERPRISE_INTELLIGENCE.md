# E0 — Enterprise Intelligence

Authorized September 10, 2026. Big Sis is the same public product as Big SYZ. This is a separate private T.O.I. business view, not a customer personal-context consumer and not M4 permissions.

## Activation and authority

`ENTERPRISE_INTELLIGENCE_ENABLED=true` and `ENTERPRISE_OWNER_USER_ID=<one existing founder database ID>` enable the coordinator. The authenticated account must also currently have `COMMANDER_IN_CHIEF`. The server ignores caller-supplied owner IDs. The background source reader rechecks the owner's current database role. Customers, other commanders, missing sessions and disabled gates cannot read the dashboard or ledger.

Keep `CORE_PERSONAL_EXECUTION_ENABLED=false` and `CORE_REASONING_RECONCILIATION_ENABLED=false`. M1/M2 founder gates are independent and unchanged. No provider calls, publishing, email, ads, Stripe mutations, purchases, personal state initialization or tool execution are added.

## Shared coordinator and sources

Ten logical roles share one `EnterpriseBriefV1`; they do not run ten models or keep separate memories. Each role receives relevant findings from the deterministic analysis. Qualitative content/marketing/journey judgments remain evidence-limited; they must not pretend a title or caption proves video quality or causation.

Authoritative reads are limited to owned Social campaigns/connections/snapshots, product-matched Stripe sessions, aggregate auth audit events, and product-specific entitlement/completion aggregates. Product answers, LifeContext, Memory, Patterns, reasoning records, conversations and device data are not imported. Completion queries project timestamps only. Stripe payments remain Stripe authority; browser and response events cannot grant entitlement or establish that payment occurred.

Direct Social analytics reads reuse owned encrypted credentials in memory, never refresh or change connections, and never invoke the existing analytics refresh service (which writes Social records). Unsupported metrics/permissions and expired tokens remain unavailable. Maximum 20 published-post reads per cycle; bounded network timeouts. A snapshot is lifetime per post, not unique reach across platforms.

Stripe creation-cohort reads are capped at 2,000 sessions per analysis, use no automatic network retries and omit founder sessions from buyer sales/revenue. Reaching a read cap marks commerce unavailable. Gross paid revenue is not net revenue after refunds/fees. Payment-attempt count means sessions with a linked latest charge, not every attempted card submission. Historical browser events and checkout opens cannot be reconstructed.

## Analysis state, events and ledger

Three collections store only E0 operational data: `enterprisestates` (latest derived brief/lease), `enterpriseevents` (minimal business event receipts), `enterprisedecisions` (deduplicated proposed interventions/outcomes). These are analysis state, not copies of underlying campaigns, payments or customer profiles. Native `_id` uniqueness handles duplicate events and leases. No explicit index changes, migrations, historical owner assignments or new personal models.

Browser events contain a session-scoped random visit ID, random event ID, event name, allowlisted platform/campaign and optional checkout return state. No URLs, arbitrary UTM strings, referrers, names, email, IP, credentials, answers or private context are stored. Global Privacy Control and Do Not Track disable browser telemetry. Browser events are unverified and can be blocked or spoofed; no conversion denominator treats them as verified people. No telemetry request consumes the existing buyer API limiter allowance; it has a separate limiter. Telemetry failures never gate purchase/auth/results.

Response observers inspect only route, HTTP status, origin and whether the authenticated ID matches the configured founder. They do not inspect request/response bodies. They record operational successes/failures without changing the response. Webhook response health is platform operational evidence, not proof of fulfillment. Browser `product_complete` is separate from retained server completion records. Purchase remains a Stripe query, never a client event.

E0 polls every 15 minutes and once shortly after boot. Database leases deduplicate replicas/restarts. Event receipts arrive immediately, but aggregate dashboard refresh is bounded to the polling cadence. No outbound notifications are sent. Stale briefs are visibly labeled after 35 minutes; failures preserve the last successful brief and an explicit failure marker. This observes uptime; it is not an uptime SLA. A sleeping/unavailable Render instance cannot run an in-process monitor; the stale indicator exposes that limitation.

Evidence fingerprint plus finding ID prevents repeat ledger creation. A founder can record keep/revert/iterate/failed/rejected/pending with a concise business outcome via the protected decision endpoint. Recording an assessment never executes a proposed intervention. Failed/rejected recommendations are suppressed until evidence changes. Initial recommendations have no claimed experimental outcome. Current ledger/receipt retention is explicit and non-destructive; no automatic deletes are introduced. Revisit volume/retention and indexes with separate authorization as data grows.

## UI and routes

- Private mobile dashboard: `/app/commander`; existing shared Academy Google identity.
- `GET /api/enterprise/brief`: read-only cached brief and owner-scoped ledger; no initialization.
- `PATCH /api/enterprise/decisions/:id`: founder analysis assessment only.
- `POST /api/enterprise/events`: minimal unverified business telemetry; origin check and own rate limit, no execution authority.

The dashboard shows revenue, every funnel stage, coverage, channel state, service health, findings, approval queue and shared team. Missing metrics are not zero. No cross-stage percentage is calculated without comparable joined cohorts. Existing campaign URLs have platform/campaign UTMs but no post identity. Payment attribution remains uninstrumented; this release does not modify live campaign links or Stripe session parameters.

## Verification and rollback

`npm run e0:test` covers owner/role/gate denial, customer isolation, private-field rejection, event deduplication, wrong origin, monitoring lease/restart, outcome suppression, zero-write GET, foreign-ledger denial, deterministic synthesis, source firewall, read-only Stripe/Social integration, founder exclusion, missing metric semantics, response observation and browser privacy/failure isolation.

`npm run e0:browser` exercises actual HTTP+MongoDB with desktop and 390px mobile rendering, reload, unauthorized state clearing and no Task effects. Existing M1, M2, M3, Social, commerce/auth and production builds remain required. New production telemetry cannot be presented as historical coverage.

Rollback: set `ENTERPRISE_INTELLIGENCE_ENABLED=false` and redeploy the verified commit. This denies Commander reads, disables new event storage and stops the monitor on boot. Retained analysis state is left intact. No Core gates, indexes, customer data, Social campaigns or commerce configuration change. A code rollback to the pre-E0 commit is also available; do not delete E0 state during rollback.

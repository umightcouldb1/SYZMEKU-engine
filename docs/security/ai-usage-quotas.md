# Shared free AI request quota

This change is an application request quota, **not a provider-account dollar spending cap**.

## Admission and operational change

All anonymous and unpaid Gemini calls share **100 admitted attempts per UTC day**, stored in MongoDB. Creating another account, restarting the app, or adding replicas does not create another allowance. Attempts are charged before provider transport and are not refunded after provider failures, disconnects, validation failures, or timeouts. Each caller-level retry obtains another admission; the free Gemini SDK client is configured for one attempt with no automatic SDK retry. A fixed UTC-day boundary can admit up to two daily allowances across midnight.

Previously only anonymous gateway traffic had a 100-attempt process-local limit; authenticated unpaid accounts were not part of that pool. This change intentionally brings generic signed-in AI, onboarding, vision, memory analysis, Core analysis/recommendations and structured reasoning into the shared free pool. Exhaustion affects all free users until the next UTC day, not paid Freedom Audit generation. An abusive visitor can exhaust a shared pool, but cannot increase its aggregate allowance by registering accounts. Existing per-IP limiters remain in effect.

The `AiQuotaBucket` collection uses the built-in unique `_id` index and a conditional atomic increment with majority write acknowledgement. Exhausted-bucket upsert collisions are denied. Database/identity lookup failures fail closed before a Gemini request. Free counter records contain only a day identifier and attempt count. Paid Freedom Audit counters contain the internal account ID, UTC hour and count, never prompts. There is no automatic deletion; retain counters across restarts and deploys. Database rollback or deleting this collection can invalidate quotas.

## Deliberate exemptions

- A stored `COMMANDER_IN_CHIEF` role retains normal operator access, including the separate academy-automation provider. Role values in request bodies do not grant an exemption.
- Only the server-owned Freedom Audit generator marks its product context. The authenticated account must still have a stored `paid` purchase matching `FREEDOM_AUDIT_STRIPE_PRICE_ID`. This exemption from the free pool preserves existing purchased Freedom Audit access. The existing 30-generations/hour allowance is also enforced by a shared per-account UTC-hour counter, so restarts and replicas cannot multiply it; the original request limiter/lease remains an additional restriction. An hour boundary can admit two hourly allowances across midnight/the boundary. It it does not grant unlimited generic AI access from a $37 purchase.
- Refunded/canceled purchases do not qualify. Payment synchronization owns purchase status. No payment records or entitlement rules are changed by this quota service.
- Local Ollama calls do not consume the Gemini free pool.

## Free attempt bounds and coverage

- Gateway: 4,000 prompt characters / 16 KB, 512 output tokens, 15-second client deadline. Registered free accounts receive the same bounds as anonymous demo calls.
- Legacy model router and structured reasoning: assembled prompt/media payload at most 256 KiB, at most 4,096 output tokens, 15-second client deadline. Existing stricter caller validation still applies. Free vision media above this assembled-input limit is rejected rather than sent to a provider.
- Provider entry points guarded: `aiGatewayController.processWithGemini`, `modelRouter.requestModelJson` (including `requestModelText`), and `reasoningProviderService.generate` (including structured generation and retries).
- Existing anonymous/gateway concurrency and rolling process limit remain extra, process-local restrictions. The daily aggregate allowance is shared; in-flight concurrency is not globally coordinated. Daily bounds limit accepted attempts across replicas, but do not promise a global three-request concurrency ceiling.

Client cancellation does not prove that provider processing or billing stopped. Paid calls use the existing product allowance in shared storage; operator calls intentionally are not subject to this free quota. Other applications using the same provider key/account are outside this service. Model pricing, provider retries, and server-side generation behavior mean request/token limits must not be described as a hard currency cap.

## Verification and deployment

Unit/provider regression suite: `node --test server/tests/aiQuota.test.cjs server/tests/anonymousAiBudget.test.cjs server/tests/reasoningProvider.test.cjs`.

Disposable database integration: `node --test server/tests/aiQuotaIntegration.test.cjs`. This checks the actual conditional upsert under concurrency and a module restart against the same database. No paid provider requests are made.

Deployment needs the existing application database to allow access to `aiquotabuckets`. No new account, key, or paid service is required. Verify the database integration tests and free/paid/operator smoke paths before rollout.

A separate provider-account budget requires the owner to approve an exact currency amount, period, provider project/account, and desired enforcement behavior. Alerts alone are not hard spending caps. This patch neither configures a provider budget nor changes provider-account permissions.

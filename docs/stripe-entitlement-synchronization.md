# Stripe entitlement synchronization

Checkout verification and signed webhook deliveries use the same synchronizer. The event is only a trigger: current Checkout, PaymentIntent, Charge and, where applicable, Dispute state is retrieved from Stripe. No customer email is used to select an account. Conflicting identity metadata, missing accounts and a checkout already attributed to another account are rejected.

Updates compare the full prior purchase array and tier before atomically replacing purchases. A concurrent change retries with new Stripe reads. Other profile fields, ownership, account roles, preferences and assessment history are not rewritten. Checkout/price pairs remain idempotent; paginated lines are collected and same-price amounts summed. Historical product tiers and purchase dates are retained. Legacy manual refunded/canceled records are never restored by replay or checkout verification. Independent legacy tier grants are preserved; purchase-derived tiers are recalculated from paid purchases.

Completed-but-unpaid and failed asynchronous payments do not grant access. Successful asynchronous payments use the same paid-state checks as synchronous payments. A delayed failure notification cannot override a currently settled payment. Non-payment Checkout sessions (subscriptions) are outside this one-time-purchase synchronizer.

## Policy pending

Refund/dispute processor facts are recorded, including PaymentIntent/Charge references, refunded amount in minor currency units, full-refund flag and current dispute status. At this stage these facts do not independently change access. Full-refund revocation, open-dispute suspension, dispute-win restoration and dispute-loss revocation require the owner's explicit policy decision. Do not describe refund/dispute enforcement as complete until that decision and its tests are implemented. Partial refunds do not identify which item in a multi-item checkout was refunded, so no per-item removal is inferred.

## Provider rollout prerequisite

Read-only inspection found the enabled live backend endpoint subscribed only to `checkout.session.completed`. The disabled legacy root endpoint is not used. After code validation/deployment and authorized provider configuration, enable:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_reinstated`
- `charge.dispute.funds_withdrawn`
- `refund.created`
- `refund.updated`
- `refund.failed`

No endpoint or payment changes were made during inspection. These events do not backfill old refunds/disputes; a separately reviewed reconciliation of historical purchases is needed before asserting all existing records match Stripe. Provider outages cause retryable webhook failures rather than granting unverified access.

## Tests

`node --test server/tests/stripeEntitlements.test.cjs` uses isolated provider/model fixtures and no payments, AI requests or database connection. Commerce regression/browser fixtures now include PaymentIntent and Charge reads. Full commerce regression needs a runnable disposable Mongo replica set; a local startup failure is not a passed integration run.

## Historical dry-run

`node server/scripts/reconcileStripeEntitlements.cjs --account=acct_EXPLICIT_ACCOUNT --limit=100` runs an aggregate-only, read-only comparison using existing service credentials. It verifies the selected Stripe account and disables automatic database collection/index creation. Output contains counts only, not customer names, checkout IDs, amounts or secrets. `--apply` is deliberately disabled pending explicit access-policy and historical-backfill authorization. A truncated or errored dry-run is not a complete reconciliation.

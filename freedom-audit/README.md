# The Freedom Audit

Independent paid product app for the SYZMEKU Engine repository.

## Google sign-in

The access gate includes Google sign-in/sign-up and email/password. Both use the existing SYZMEKU account and session system. A first visit to Freedom Audit does not require creating a separate account. Google credentials are sent to `/api/auth/google` for server verification; paid access is still checked through `/api/freedom-audit/entitlement`.

The build defaults to the same public Google web client ID as Big SYZ. An explicit `FREEDOM_AUDIT_GOOGLE_CLIENT_ID` (or `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`) must match the backend's accepted audience. In Google Auth Platform, add `https://freedom.toisouljahacademy.com` as an authorized JavaScript origin on that existing web client. Keep the existing Big SYZ origins. Do not use wildcard or arbitrary preview origins.

Use `npm test --prefix freedom-audit` for isolated auth flow fixtures. Before release, verify the actual Google provider flow on the authorized production origin, existing-account reuse, server entitlement response, and the checkout handoff without charging a card. See `docs/freedom-audit-google-signin.md` for the scoped contract.

## Local Development

From the repository root:

```bash
npm install
npm install --prefix freedom-audit
npm run build --prefix freedom-audit
```

Open `freedom-audit/dist/index.html`, or serve the `freedom-audit/dist` folder with any static server.

The app talks to the SYZMEKU API. For local API testing, set:

```bash
FREEDOM_AUDIT_API_BASE_URL=http://localhost:5000/api
FREEDOM_AUDIT_BIG_SYZ_URL=http://localhost:5173
```

Run the existing API from the repo root with:

```bash
npm run dev:server
```

## Stripe Configuration

The Freedom Audit reuses the existing SYZMEKU Stripe stack:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- existing `/api/webhooks/stripe` or `/webhook/stripe` webhook handling
- existing `UserProfile.purchasedProducts` entitlement model

Create one Stripe product named `The Freedom Audit` with a one-time USD price of `3700` cents. Set the backend environment variable `FREEDOM_AUDIT_STRIPE_PRICE_ID` to that exact Stripe price id. Freedom Audit entitlement is tied to this configured price id, not to product name matching.

Production Stripe configuration:

```text
Product ID: prod_V60FCCIsi8quB5
Product name: The Freedom Audit
Price ID: price_1U5oFA6K9xPHaof1VTFTo7eo
Price: $37 USD one-time
```

Recommended Stripe metadata:

```text
tier=freedom_audit
productSlug=freedom-audit
```

The Freedom Audit checkout endpoint is:

```text
POST /api/freedom-audit/checkout/session
```

Access is verified server-side through:

```text
GET /api/freedom-audit/entitlement
POST /api/freedom-audit/checkout/verify
POST /api/freedom-audit/results
```

The commercial flow is:

```text
Freedom Audit Vercel frontend
-> SYZMEKU API on Render
-> Stripe Checkout
-> Stripe webhook / server verification
-> MongoDB user purchase entitlement
-> Freedom Audit results
-> customer-facing Big SYZ frontend
```

## Vercel Deployment

Create a separate Vercel project connected to `umightcouldb1/SYZMEKU-engine`.

Use these settings:

```text
Root Directory: freedom-audit
Framework Preset: Other
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

Set `FREEDOM_AUDIT_APP_URL` on the SYZMEKU API deployment to the production URL of this Vercel project. Also include the Freedom Audit Vercel origin in the API `CLIENT_ORIGIN` allowlist.

The existing customer-facing Big SYZ / T.O.I. Souljah Academy frontend is derived from the root repository `vercel.json` and production Render example as:

```text
https://www.toisouljahacademy.com
```

Use that frontend URL for `FREEDOM_AUDIT_BIG_SYZ_URL`. Keep the API base pointed at Render.

## Required Environment Variables

Freedom Audit Vercel project:

```text
FREEDOM_AUDIT_API_BASE_URL=https://syzmeku-api.onrender.com/api
FREEDOM_AUDIT_BIG_SYZ_URL=https://www.toisouljahacademy.com
```

SYZMEKU API deployment:

```text
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FREEDOM_AUDIT_STRIPE_PRICE_ID=price_1U5oFA6K9xPHaof1VTFTo7eo
FREEDOM_AUDIT_APP_URL=https://your-freedom-audit-project.vercel.app
CLIENT_ORIGIN=https://your-existing-client-origin,https://your-freedom-audit-project.vercel.app
MONGO_URI=mongodb+srv://...
JWT_SECRET=...
```

`CLIENT_ORIGIN` should include the existing customer-facing frontend and can include the Freedom Audit Vercel URL. The API also reads `FREEDOM_AUDIT_APP_URL` directly into the credentialed CORS allowlist, so the separate Freedom Audit deployment can be authorized without using `*`.

## Testing Purchase Flow

1. Run the API with Stripe test keys.
2. Run the Freedom Audit build with `FREEDOM_AUDIT_API_BASE_URL` pointed to that API.
3. Create or log into a SYZMEKU account from the Freedom Audit page.
4. Click `Buy The Freedom Audit - $37`.
5. Complete Stripe Checkout using a test card.
6. Return to the app. The app calls `/api/freedom-audit/checkout/verify` so access is granted only when Stripe reports the session as paid for the signed-in user.
7. Complete all 20 ratings and submit the audit.
8. Confirm the result is saved to `UserProfile.freedomAudit.latestResult` and the purchase is present in `UserProfile.purchasedProducts`.

If the webhook arrives before the redirect verifier, entitlement is available immediately. If the webhook is delayed, the verifier records the paid product after validating the Stripe Checkout session server-side.

## Production-Readiness Test Checklist

- New account signup works from the Freedom Audit frontend.
- Existing account login works from the Freedom Audit frontend.
- Unpaid signed-in user is denied audit result generation.
- Checkout session creation requires authentication.
- Stripe Checkout shows the configured one-time `$37` Freedom Audit price.
- Successful Stripe test payment redirects back to the Freedom Audit frontend.
- Stripe webhook fulfillment records a paid purchase on the correct `UserProfile`.
- Redirect verification records entitlement if the webhook is delayed.
- Entitlement persists after logout and login.
- Results generation succeeds only after paid entitlement exists.
- Results are persisted to `UserProfile.freedomAudit.latestResult`.
- Audit retake updates `latestResult` and retains bounded history.
- Duplicate webhook delivery does not create duplicate purchases for the same session and price.
- Wrong Checkout Session ID is rejected.
- Another user's Checkout Session ID is rejected.
- Unpaid or incomplete Checkout Session is rejected.
- Canceled checkout returns gracefully without granting access.
- Big SYZ continuation opens `https://www.toisouljahacademy.com`.
- Existing SYZMEKU catalog, checkout, profile, and webhook behavior still works for non-Freedom-Audit products.

## Freedom Audit verification and release gate (2026-10-20)

The AI path sends the 20 question texts, ratings and customer priorities to Gemini through the existing provider adapter. It accepts only six ordered phases with bounded actions, checkpoints and exact evidence quotations. The scoring remains deterministic. Evidence quotations establish traceability; they do not prove that every inference is correct or that every unsafe instruction can be detected. Two distinct real Gemini profiles passed the isolated acceptance journey described below.

Generation has a 45-second abort deadline, a database-backed per-user generation lease, a 30-request/hour per-process limit and an audit-specific 6144-token output limit with a 512-token thinking budget and a structured response schema. Other provider callers retain their existing defaults. Truncated responses are rejected. Provider errors do not save a partial plan. The latest ten results and evidence are stored atomically and retrieved only for the authenticated entitled account. Concurrent Freedom Audit checkout verification/webhook replay appends one purchase and does not reactivate an already revoked purchase.

Verification commands (reuse installed dependencies):

```bash
npm run freedom-audit:test
npm run freedom-audit:browser
npm run build --prefix freedom-audit
```

The browser harness uses a disposable MongoDB replica set, real Express routes and password authentication, and explicitly fake Stripe/Gemini transport. It checks signup, unpaid access, checkout return, 20 ratings, six-phase results, desktop/mobile rendering, reload retrieval, provider failure, retry, retakes and returning login. It never uses a live payment key or production database. Screenshots are written to `.cache/audit-browser`. On Windows, if MongoDB cannot rename files in the sandbox temporary directory, set `TMP` and `TEMP` to a writable workspace directory. `MONGOMS_DOWNLOAD_DIR` can point to an existing binary cache.

### Real-provider acceptance evidence

On 2026-10-20, the branch ran at the already-authorized `http://localhost:5173` origin with real Express/shared auth routes, a disposable MongoDB replica set, the stored Gemini credential and Stripe test credentials. No production data, configuration or deployment changed.

- Real Google identity credential exchange succeeded and initially left the account unpaid.
- Hosted Stripe Checkout completed a $37 USD test-card payment. Session `cs_test_a1XohmEFaBuDmflQWApjMuCqfQ3W8BEjlRYpY98qt5fLkWW1eqWbdPxvzw` was independently retrieved as `livemode=false`, `status=complete`, `payment_status=paid`.
- Stripe CLI forwarded genuine signed event `evt_1USipS6K9xPHaof16HMImH3m`; `/api/webhooks/stripe` returned 200. Redirect verification and webhook fulfillment left one purchase.
- The isolated test price was `price_1U5qnP6K9xPHaof1o7hJchqr`, an existing $37 sandbox fixture labelled `Wrong Freedom Audit Price - TEST`. It was explicitly configured as the accepted price in this disposable environment; this does not change or validate the production price configuration. Future runs must supply an explicit test price rather than selecting by product name.
- The paid browser journey submitted all 20 ratings, received and persisted a real `gemini-2.5-flash` design-portfolio plan, retrieved it after navigation, and saved a distinct household-budget retake. Both results contain six ordered phases, checkpoints and validated evidence references.
- A real generation failure preserved the answers and saved no partial result; customer retry succeeded. This verifies recovery, not a guarantee of first-attempt provider availability or acceptance.
- Consolidated backend/provider regression: 16 passed; frontend auth/recovery fixtures: 11 passed. The earlier browser harness also passed with explicitly fake Stripe/Gemini. The full repository workflow remains a separate merge gate.

Repeat isolated verification with `node server/scripts/verifyFreedomAuditLocal.cjs`. Supply `STRIPE_SECRET_KEY` (must start `sk_test_`), an explicit test `FREEDOM_AUDIT_STRIPE_PRICE_ID`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, and optionally `STRIPE_CLI_PATH`. Reuse installed dependencies and MongoDB binaries. The harness binds only loopback, starts disposable MongoDB and the test-only Stripe listener, serves this branch's frontend, and writes local evidence to `.cache/freedom-audit-live`. It never reads production MongoDB. Stop with Ctrl+C after collecting evidence. Do not commit credentials or local customer records.

Readiness: the real-provider customer journey is verified in isolation. Merge still requires the current GitHub checks; production rollout and a post-deployment smoke check require separate authorization. The unchanged production deployment has not been certified as running this branch.

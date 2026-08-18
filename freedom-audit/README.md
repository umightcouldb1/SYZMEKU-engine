# The Freedom Audit

Independent paid product app for the SYZMEKU Engine repository.

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

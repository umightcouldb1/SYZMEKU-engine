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

Create one Stripe product named `The Freedom Audit` with a one-time USD price of `3700` cents. Set the backend environment variable `FREEDOM_AUDIT_STRIPE_PRICE_ID` to that Stripe price id.

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

## Required Environment Variables

Freedom Audit Vercel project:

```text
FREEDOM_AUDIT_API_BASE_URL=https://syzmeku-api.onrender.com/api
FREEDOM_AUDIT_BIG_SYZ_URL=https://syzmeku-api.onrender.com
```

SYZMEKU API deployment:

```text
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FREEDOM_AUDIT_STRIPE_PRICE_ID=price_...
FREEDOM_AUDIT_APP_URL=https://your-freedom-audit-project.vercel.app
CLIENT_ORIGIN=https://your-existing-client-origin,https://your-freedom-audit-project.vercel.app
MONGO_URI=mongodb+srv://...
JWT_SECRET=...
```

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

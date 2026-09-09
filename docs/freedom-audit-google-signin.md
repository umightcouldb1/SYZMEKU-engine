# Freedom Audit Google sign-in contract

User-authorized addition after the M1 read-only release. Google sign-in/sign-up is a default for future account-based Academy products.

1. Offer the official Google Identity Services button in the Freedom Audit access gate, alongside email/password.
2. Exchange the returned Google credential only through the existing POST /api/auth/google endpoint. Its server verification and shared User/AuthSession records remain authoritative. No new identity store or role assignment path.
3. Reuse the canonical Google web client. Authorize the exact production origin https://freedom.toisouljahacademy.com; do not broaden origins with wildcards or arbitrary previews.
4. After either auth method, save the existing app session format, clear stale entitlement/results from a previous identity, and refresh the server entitlement. Continue the existing checkout-return verification when applicable. Google sign-in alone never unlocks paid access.
5. Missing credentials, provider loading failures, rejected credentials, and unavailable entitlement requests must leave access locked and offer a recovery path. Serialize sign-in requests.
6. Verify browser layout and auth/session/entitlement transitions with fixtures, then verify the production Google account flow and checkout handoff without purchasing.

Core writes stay unset/false. No personal-data migration, ownership backfill, social campaign mutation, loop correction, or M2 implementation is included.

References: [Google button guide](https://developers.google.com/identity/gsi/web/guides/display-button), [authorized origin setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

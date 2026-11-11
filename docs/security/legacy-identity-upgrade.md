# Per-account legacy identity upgrade

This flow closes automatic email-only Google linking without bulk relabeling, password resets, or session revocation. Existing password sign-in and existing version-zero sessions continue until that account's verified owner explicitly upgrades it.

For a legacy record without identity metadata, a verified Google sign-in first receives a security-choice response, not an application session. Its short-lived signed challenge is bound to the user ID, provider subject and current session version. The UI never persists that challenge, password or provider token.

The account owner chooses one method, then uses Google again to confirm:

- Keep the current password and link Google: requires the current password as well as verified Google identity.
- Google-only recovery: offered only when Google is authoritative for the email (Gmail or a verified Workspace domain claim). Other third-party email accounts require current-password proof or manual ownership recovery. This option explicitly disables the old password method. The stored hash is not replaced, but password sign-in is rejected afterward.

Both options clearly disclose that prior sessions for this account will be signed out. An atomic compare-and-set requires the original password, legacy identity state and current version, binds the Google subject, and increments the account session version. Account ID, owned data, purchases and role are preserved. A concurrent identity or credential change rejects the attempt without issuing a session.

Middleware, refresh and Core/Pattern/Reasoning session rechecks require matching user/session/token versions. Records and tokens without a version are version zero. Versioned-session invalidation is immediate without deleting session records or depending on a subsequent cleanup transaction. No other user's sessions change.

Deployment alone does not migrate records. Do not run a bulk reset or guess historical provider provenance. Recovery follows Google’s authoritative-email guidance (Gmail or a signed Workspace hd claim); Workspace alias domains are allowed. Obtain the owner’s recovery-policy approval and verify the real provider/browser flow before rollout. Requests already admitted before invalidation may finish; epoch checks reject subsequent requests and protected rechecks. A rollback to code that ignores session versions would re-enable old sessions and must not be used after upgrades begin without an explicit security recovery plan.

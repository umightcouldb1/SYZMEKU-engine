# Security hardening and rollout gates

This is an incremental mitigation. It does not reset existing credentials, revoke existing sessions, or claim that all historical identities have verified provenance.

## Authentication

Public password login no longer uses `RESET_ADMIN_PASSWORD` to accept an incorrect password. Public password registration rejects the reserved administrator email and always creates an ordinary USER. Existing correct-password administrator login remains available.

New accounts carry explicit identity metadata. Google-created accounts bind the verified provider subject. A new password account links Google only after both verified Google identity and current-password proof, using an atomic compare-and-set. Concurrent changes fail without issuing a session. Linked identities are looked up by Google subject before email, preserving account ownership if Google's email changes. Frontends support retry, cancellation and normal password login without persisting passwords or provider credentials.

Legacy records without identity metadata retain their previous behavior. They are not silently relabeled or reset. Historical email-only linking risk therefore remains unresolved for those records. A reviewed recovery/verification migration is required for full closure. Explicit null or malformed versioned metadata fails closed.

Fresh startup-created administrators receive identity metadata. Existing explicit startup password recovery remains separate from public login and can re-enable the password method for a versioned Google administrator without changing its linked subject or inventing legacy provenance.

The model declares a unique partial index on nonempty Google subjects. New enrollment and linking wait for index initialization and inspect the actual unique partial constraint before writing. Missing or incorrect indexes fail closed for those writes while legacy logins remain available. Startup emits a sanitized index verification success/failure log that must be checked after deployment. The isolated database test checks index enforcement, concurrent links, signup/reset protections and legacy compatibility using only disposable records and mocked Google transport.

## Anonymous AI

The public demo has a five-requests/IP/15-minute limiter, a 4,000-character/16-KB prompt limit, 512 maximum output tokens, a 15-second deadline, three concurrent provider calls, and 100 admitted attempts per process per 24 hours. Failed attempts count. Authenticated and Commander paths are unchanged.

These are process-local controls. Restarts reset counters and replicas multiply allowances. Public signup remains available, so anonymous-only limits are not a project-wide spending cap. SDK cancellation also does not guarantee provider processing or billing stops. Shared atomic quotas and provider budget controls remain separate work.

## Purchase privacy and media

Anonymous Genesis readiness no longer queries or returns an individual's payment, seat or purchase status. Aggregate availability and the existing secret-authenticated confirmation flow remain.

Media downloads validate public IPv4/IPv6 and all DNS answers, pin the validated connection address while preserving TLS hostname verification, reject redirects, enforce streaming byte bounds, and apply a deadline. Existing redirecting URLs may require a direct hosted replacement. No external publishing permissions are changed.

## Dependencies and verification

Supported-major dependency lockfile upgrades address available security fixes; remaining advisories require separate review. Run `npm run security:test`, `npm run security:integration`, the existing M1/M2/M3/business/commerce checks, and frontend builds. The existing CI workflow includes the new security checks.

Earlier local attempts to start disposable MongoDB and real Chromium were blocked by environment EPERM errors before tests could run. Mocked unit/browser-script checks are not a substitute for the database tests, real browser verification, provider configuration or the final CI result.

Before production rollout, verify final commit checks, subject-index enforcement, Google linking/retry/cancel and existing-account login. Preserve ownership and paid entitlements. Refund/dispute synchronization and a reviewed legacy identity migration remain outstanding. No credentials, customer records or private drafts belong in this repository.

# Product authentication requirements

All new account-based Academy apps must include Google sign-in/sign-up by default, alongside any approved email/password method. Reuse Big SYZ's shared /api/auth/google identity service rather than creating separate accounts or client-side identity checks. Keep roles, ownership and payment entitlements server-authoritative.

Authentication delivery includes the official Google Identity Services button, validated client ID, exact authorized production origins, accessible mobile UI, recoverable failures, and verification of new/existing-account sign-in. Do not mark it complete if provider configuration or real sign-in is unverified.

M1 Core write enablement, data migrations, and M2 work remain separate from authentication UI changes.

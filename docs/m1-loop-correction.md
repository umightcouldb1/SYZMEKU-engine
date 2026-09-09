# M1 loop correction contract

Scope: two post-deployment defects only. Preserve all authenticated ownership/operator guards and existing execution paths. No M2, Core write enablement, migration, index change, commerce behavior change, or social campaign change.

- A paused POST /api/core/loop/start returns 503 and the existing maintenance reason. Other failures retain their existing handling.
- GET /api/core/loop/status and /api/core/summary perform owner-scoped reads only. Missing owned state yields stopped defaults. These GETs do not initialize database or in-memory personal state.
- Owned persisted active flags do not indicate a running loop without an existing authenticated runtime timer. Foreign or ownerless records never supply defaults or opt-in.
- Boot remains a no-op requiring authenticated restart. Social's independent scheduler is unchanged.

Regression evidence must include successful repeated GETs with no owned state, zero MongoDB mutation commands (including when writes are enabled in isolated fixtures), no runtime initialization, foreign/ownerless exclusion, paused start 503, no boot restore, existing M1/commerce/Social/auth tests, and production verification with Core writes unset.

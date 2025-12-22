## SYZMEHKU Mirror Mode Dev Notes

- Mirror mode MUST default to the authenticated user’s own prism.
- Do not hardcode Architect metadata.
- Devs may test with `origin: 'architect'` using Codex override keys.
- Ensure `/mirror/intake` syncs at login, and persists in JWT.

# T.O.I. Souljah Academy System Manifest

## Public Purpose

The T.O.I. Souljah Academy interface is the external face of a private operating architecture: a public learning, commerce, and automation portal that can present the Academy's intelligence without exposing the local execution core.

This repository is the deployment-facing layer. It should describe, render, and route public experiences. Private desktop execution, local credentials, and machine-bound automation stay outside the public repo.

## Two-Track Architecture

```text
[Private Local Core]
  ARC Codex / Big Sis runtime
  Local executor bridge
  Windows DPAPI vault
  Make.com intake receiver
  Voice intent spine

        |
        | secure payload boundary
        v

[Public Academy Portal]
  SYZMEKU-engine frontend/backend
  Public catalog and Academy surfaces
  Login and checkout gates
  Commander-only private routes
  Deployment on Vercel and Render
```

## Operating Principles

- Public first screen: show the Academy, its offers, and its educational pathway clearly.
- Private core stays private: no local vault files, desktop paths, API keys, app passwords, or machine-bound bridge configs belong in this repository.
- Make.com remains the universal intake for external events, email, alerts, files, and webhook payloads.
- The local executor is an allowlisted edge, not a raw shell exposed to the public web.
- Checkout and sensitive workflows use authentication at the commitment point while keeping discovery surfaces public.
- Commander-only/private routes fail closed and should prefer quiet `404 Not Found` behavior when not authorized.

## Public Modules

- `Academy Interface`: public-facing pages for the T.O.I. Souljah Academy.
- `Catalog`: public product and service discovery with protected checkout.
- `Automation Status`: sanitized health and capability summaries, not raw logs.
- `System Manifest`: public explanation of the architecture and its boundaries.

## Private Modules

These modules are intentionally not committed here:

- DPAPI secret vaults.
- Local executor runtime files.
- Open WebUI database modifications.
- LM Studio process configuration.
- Machine-specific daemon files.
- Raw Make.com tokens or webhook secrets.

## Integration Boundary

Cloud-facing services can receive clean, sanitized payloads. The local core can receive clean instructions from trusted intake systems. Neither side should require publishing local secrets or granting arbitrary remote filesystem access.

The stable public contract is:

```text
Public portal -> authenticated API routes -> sanitized payloads
Make.com -> clean event payloads -> private local executor
Private executor -> allowlisted local actions only
```

## Deployment Readiness

Before deployment, verify:

- Public pages build successfully.
- No local secrets or DPAPI artifacts are present.
- Public routes do not expose private local bridge URLs.
- Login and checkout preserve return intent.
- Commander-only surfaces remain dormant or fail closed until explicitly activated.


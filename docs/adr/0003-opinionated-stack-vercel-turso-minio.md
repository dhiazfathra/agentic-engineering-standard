# ADR-0003: Opinionated stack is Next.js on Vercel, Turso, and self-hosted MinIO

## Status

Accepted

## Date

2026-09-23

## Context

Rewind is a bug-reporting tool built around screen recordings. The stack
must be cheap, simple enough for agents to build, and able to hold large
blobs. Storage is the first wall every candidate hits. The full comparison
is in `templates/opinionated/docs/diagrams/stack-comparison.html`.

## Decision

Use Next.js fullstack deployed on Vercel, Turso (libSQL) for data, and a
self-hosted MinIO for blob storage only. Clients upload straight to MinIO
with presigned URLs.

## Alternatives Considered

### Go-kratos backend on own infra

- Pros: full ownership.
- Cons: the most ops work and the most code for agents to build.
- Rejected: speculative for a cost-driven project.

### Next.js with Supabase

- Pros: one vendor, one client library.
- Cons: 1 GB storage, and the free project pauses after 7 idle days.
- Rejected: a demo that goes dark when idle is a poor fit.

### Next.js, Turso, and Vercel Blob

- Pros: one repo and one deploy target.
- Cons: 1 GB storage, and overage locks blobs for 30 days.
- Rejected: hits the storage wall with no graceful degrade.

## Consequences

- The presigned-URL upload contract is the seam. Any future blob provider
  implements the same contract.
- We own MinIO uptime, TLS, CORS, and backups on one VPS.
- `templates/opinionated/docs/STACK.md` records the stack. Its commands
  stay TBD until Rewind is scaffolded.

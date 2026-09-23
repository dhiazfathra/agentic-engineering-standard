# ADR-0011: MinIO stays on the dev machine for v1; Vercel signs but never calls it

## Status

Accepted. Narrows ADR-0003, which named "one VPS" for MinIO before any
code existed.

## Date

2026-09-23

## Context

ADR-0003 chose self-hosted MinIO on one VPS. Building `infra` (the first
module of Rewind) surfaced a cost this had not: a VPS is money and setup
time before a single feature exists, and the spec's success criteria only
need MinIO reachable from this machine and from Vercel's signing math —
not from Vercel's servers directly.

Presigned URLs are signed locally: the AWS SDK computes a signature from
the access key and secret, with no network call. Signing works from
Vercel with `S3_ENDPOINT=http://localhost:9000`, because the browser that
uploads or downloads talks to `localhost` itself, not through Vercel.

What does not work from Vercel: any server-side call that must reach
MinIO directly — `HeadBucketCommand`, deleting a blob, checking it
exists. Vercel's servers cannot reach `localhost` on this machine.

## Decision

For v1, MinIO runs only on this developer machine, in Docker
(`docker-compose.yml`). `S3_ENDPOINT` is `http://localhost:9000` in every
Vercel environment, including production. `/api/health` calls
`HeadBucketCommand` and honestly reports `"storage":"unreachable"` when
running on Vercel — this is the true state, not a bug to silence.

Any module that needs the server itself to reach storage (not just sign
a URL for the browser) documents that its Vercel behavior differs from
local, the way `infra`'s health check does.

## Alternatives Considered

### Provision the VPS now, as ADR-0003 named

- Pros: matches the original decision; server-to-storage calls work from
  Vercel immediately.
- Cons: money and setup (TLS, backups, firewall) before any feature
  exists to justify it, for a project still proving its shape.
- Rejected: the cost lands before the benefit does.

### Tunnel `localhost:9000` to the internet (ngrok or similar)

- Pros: Vercel could reach it without a VPS.
- Cons: a tunnel URL is not a stable `S3_ENDPOINT`, needs a service
  running alongside Docker, and exposes MinIO's admin surface to the
  internet with only MinIO's own auth as the gate.
- Rejected: more moving parts than the VPS it was meant to avoid, for a
  dev-only convenience.

## Consequences

- Only this machine can view or upload media from the Vercel deploy in
  v1. Anyone else hitting `https://rewind-ecru.vercel.app` gets working
  pages and API responses, but blob operations that must run server-side
  fail there until the VPS exists.
- Every later module (`rewinds-api` and beyond) that adds a server-side
  storage call inherits this limit and must say so, the way `infra` did.
- Moving MinIO to a VPS later needs only an `S3_ENDPOINT` change and DNS
  and TLS on the VPS; the presigned-URL contract from ADR-0003 does not
  change.

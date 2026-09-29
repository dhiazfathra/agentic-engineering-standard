# ADR-0004: Auth hardening

## Status

Accepted.

## Date

2026-09-30.

## Context

ADR-0003 described the session cookie as Secure in production, but the
code never set the flag. Login had no throttle, changing a password had
no endpoint, the API had no CSRF check beyond `SameSite=Lax`, the seed
published one password for every database, and production Turso once
lacked tables because nothing ran migrations on deploy.

## Decision

- **Rate limits are DB-backed fixed windows** (`rate_limits` table,
  `apps/web/src/lib/rate-limit.ts`), not in-memory. Vercel runs many
  short-lived instances, so a per-process counter would multiply every
  limit by the instance count. One atomic upsert per rule keeps the count
  exact. Windows are 15 minutes. Login: 10 per IP+email and 30 per IP.
  Password change: 5 per user. Over the limit returns 429 with
  `Retry-After`. The IP is the first `x-forwarded-for` entry. Cost: one
  prune and one upsert per rule per limited request, on the database the
  request already needs. Fixed windows allow a burst of up to twice the
  limit across a window edge; accepted.
- **CSRF origin rule** (`apps/web/src/proxy.ts`, matcher `/api/:path*`).
  POST, PUT, PATCH and DELETE with an `Origin` header are rejected with 403
  unless the origin's host equals the request `Host`, the origin is
  `chrome-extension://` or `moz-extension://`, or the request carries
  `Authorization: Bearer`. A request with no `Origin` passes: browsers
  always send it on cross-site writes, and non-browser clients hold no
  ambient cookie to abuse. The public `/api/rec/[id]/rewinds` route is
  called by the extension, so the extension exemption covers it.
- **Session cookie is `Secure` when `NODE_ENV=production`.** Dev and
  `next dev` e2e over http keep working.
- **Change password** is `PATCH /api/me/password`: 400 invalid body, 403
  wrong current password, 204 on success, which also deletes the user's
  other sessions.
- **Seed password policy.** `rewind-dev` (published in the README) is used
  only for `file:` and `:memory:` databases. Any other `DATABASE_URL` gets
  a random password, written to `apps/web/.seed-credentials` (gitignored,
  mode 600). Seeding never overwrites an existing user's password.
- **Migrations run on deploy.** `apps/web` `build` runs `drizzle-kit
migrate` before `next build` when `VERCEL_ENV=production`, the only
  environment that has `DATABASE_AUTH_TOKEN`. Local and preview builds do
  not migrate.

## Audit result

Every mutating handler that reads a body already parses it through
`packages/schema` via `parseBody`, and no route reads query parameters.
Every query on workspace-owned tables filters by the session's
`workspaceId` (or by `userId` for tokens and support messages). The
deliberate exceptions are `GET /api/rewinds/[id]` (public when the owning
workspace's `defaultLinkAccess` is `anyone`) and `POST
/api/rec/[id]/rewinds` (public by design, scoped through the link's own
workspace). No gap found.

## Consequences

- Rate limiting needs the `rate_limits` migration; a database without it
  fails logins with a 500. The deploy-time migration prevents that.
- A first-party client on another origin must send `Bearer` or be added
  to the origin rule.

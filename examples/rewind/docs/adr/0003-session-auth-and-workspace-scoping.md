# ADR-0003: Session auth and workspace scoping

## Status

Accepted.

## Date

2026-09-25.

## Context

Accounts (`a376b5f`) added users, workspaces, memberships, sessions and
access tokens. Every route added since (`3cfeb95` auth + signup/login/
logout, `b3371f9` rewinds/folders/recording-links/comments scoping,
`64e488a` uploads/library scoping, and this chunk's workspace, member,
invite, account, token and usage routes) had to answer: how does a
request prove who it is, and how is workspace data kept apart when a
user or link can only ever see their own workspace's rows.

## Decision

- **Cookie session, not JWT.** `POST /api/auth/{signup,login}` create a
  row in `sessions` and hand back a random 32-byte token in the
  `rw_session` cookie (HttpOnly, Secure in production, SameSite=Lax, 30
  days); `hashToken()` stores only its SHA-256 hash, so a DB read never
  exposes a live token. `requireSession`/`getSession`
  (`apps/web/src/lib/auth.ts`) resolve the cookie to `{user, workspace,
  membership}` in one lookup; `getPageSession` is the same resolution
  for server components, which read cookies through `next/headers`
  rather than a `Request`. A route returns whatever `requireSession`
  gives back when it's a `NextResponse`, so a missing/expired/invalid
  session always answers 401 the same way.
- **The session pins one workspace at a time.** `sessions.workspaceId`
  is set at login and changed only by minting a new session (`POST
  /api/workspaces`, `/switch`, `/join` all call `createSession` and
  `setSessionCookie` again). A user who belongs to several workspaces
  switches by getting a new session token, not by passing a workspace
  id on each request — so every other route can trust
  `session.workspace.id` without re-checking it per call.
- **Every workspace-owned row carries `workspaceId`, and every query
  filters by `session.workspace.id`.** `db.update/delete/select(...)
  .where(and(eq(table.id, id), eq(table.workspaceId,
  session.workspace.id)))` is the one shape every scoped route uses
  (folders, recording links, uploads, library, and now workspace/
  member/token routes). An id from another workspace fails that
  `and()` and the row-returning update/delete comes back empty — the
  route then answers 404, not 403, so a cross-workspace id search
  learns nothing (`SPEC-design-parity.md`: "Ids from another workspace
  return 404").
- **Role checks are a second, explicit gate.** `requireAdmin(session)`
  runs after `requireSession` and returns a 403 `NextResponse` or
  `null`; it never conflates "not a member" (401/404) with "a member,
  but not allowed" (403). Membership-count checks (the last Admin
  cannot be demoted or removed) are read fresh per request rather than
  cached on the session, since the workspace's admin roster can change
  between requests.
- **A PAT is a parallel secret, not a second auth path.** `access_tokens`
  stores a name and a hashed token per user for `GET/POST /api/tokens`,
  `DELETE /api/tokens/[id]`; the spec's `Authorization: Bearer <PAT>`
  resolution into `requireSession` is not wired up yet (see
  Consequences) — token issuance and revocation do not need it.

## Alternatives Considered

### JWT session (self-contained, no DB read per request)

- Pros: no `sessions` table lookup on every request.
- Cons: revocation (logout, workspace switch, "the last Admin can't
  leave") needs a server-side check anyway once real-time role changes
  matter, which erases the win; a DB-backed session already exists in
  the design and needs no new library.
- Rejected: the extra read is one indexed lookup, and cookie sessions
  keep revocation trivial (delete the row).

### Workspace id in the URL or request body, trusted from the client

- Pros: one session works across workspaces without re-minting a token.
- Cons: every route would need to re-verify membership for that id on
  every call, duplicating the check `sessions.workspaceId` already
  gives once at session-creation time; a forgotten check anywhere is a
  cross-workspace leak.
- Rejected: pinning the workspace to the session moves the one place
  that can get this wrong from "every route" to "the three routes that
  mint a session."

### Middleware-level auth (a single Next.js middleware gating all
`/api/*`)

- Pros: one file, not a `requireSession()` call per route.
- Cons: role gates (`requireAdmin`) and workspace-scoped filtering still
  need to happen per route regardless; middleware can't return the
  loaded `session` object to the route handler without a second lookup
  in the handler anyway.
- Rejected: `requireSession(req)` at the top of each route is the same
  cost with no framework-specific indirection.

## Consequences

- A route that forgets the `workspaceId` filter is a real
  cross-workspace leak, not just a lint warning — this ADR's shape is
  the thing to check for in review, and every new scoped route's tests
  must include a 404 cross-workspace case, matching
  `SPEC-design-parity.md`'s testing bar.
- Switching or joining a workspace always mints a new session and
  cookie; a client that caches the old cookie value (rather than
  reading `Set-Cookie`) will keep hitting the old workspace.
- The `Authorization: Bearer <PAT>` path the spec describes for
  extension/API use is not implemented: `requireSession` only reads the
  `rw_session` cookie. Wiring PATs into it is follow-up work, tracked
  as a gap rather than silently built into this chunk's routes.
- Deleting a user (`DELETE /api/me`) relies on `ON DELETE CASCADE` on
  `sessions`, `access_tokens` and `memberships` to clean up in one
  statement; a workspace left with no membership row is deleted next in
  the same handler, cascading to its folders/recording-links/rewinds —
  there is no undo, matching the spec's stated behavior.

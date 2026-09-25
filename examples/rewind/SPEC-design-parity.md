# Spec: design parity

Implement every screen, overlay and interaction in `Rewind.dc.html`
(Claude Design project `9bb10f93-f534-4e75-831a-253a96666114`) in
`apps/web`. Status: scope set by the user on 2026-09-25.

## Decisions (user, 2026-09-25)

1. The design, not `CAPABILITY-MAP.md`, is the source of truth. Items
   the map deferred (accounts, workspaces, members, invites, billing,
   AI, integrations, SDK, CLI, MCP, webhooks, helpdesk, support, status)
   are in scope. `CAPABILITY-MAP.md` gets a note that this spec
   supersedes its deferred list.
2. An element with no real backend is still built to match the design,
   behind a feature flag that defaults OFF.
3. Group duplicates is real: a Rewind's `errorSignature` comes from its
   first error event (rules below). Rewinds with the same signature
   group.
4. Schema changes needed for accounts are approved.
5. Delete toasts keep no timer (ADR-0002). The design's 5 s auto-dismiss
   is not copied.
6. The viewer's tabs change to the design's: Summary, Actions, Console,
   Network, Comments.

## Source

The design is plain CSS over `--rw-*` tokens (`src/styles/tokens.css`).
Port each block's inline styles into the screen's CSS module, with the
same values. Reuse what exists: `ToastStack`/`useToast`,
`copyRewindLink`, `initials`, `personColor`, `formatTime`, `timeAgo`,
`STATUS_LABEL`, the theme store, the palette, the library reducer. A
decoded copy of the design lives in `docs/design/Rewind.dc.html`;
refresh it from the MCP before starting.

## Feature flags

`src/lib/flags.ts`: one typed object read from `NEXT_PUBLIC_FLAG_<NAME>`
env vars. `"1"` turns a flag on; anything else, or unset, is off. No
flag service, no runtime toggles. `.env.example` lists every flag set
to `0`. A flagged element is not rendered when its flag is off; its
route or API returns 404.

| Flag                | Gates                                                                                                                                                                | Why it is gated                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `AI_SUMMARY`        | Viewer Summary tab's "AI summary" and "Likely root cause" blocks; editor "AI summary" toggle; Settings › General "AI" toggle; Billing "AI summaries" usage row       | No model call. Text is static.                                                                  |
| `SIMILAR_MERGE`     | Viewer "Merge into one issue" button                                                                                                                                 | No issue entity to merge into. The similar list itself is real (same `errorSignature`).         |
| `INTEGRATIONS`      | Settings › Integrations grid, viewer "Send to Linear", editor destination picker (all but "Link share"), Get started "Connect an integration"                         | No OAuth with Linear, Jira, GitHub or the rest. Connect state is stored, nothing is sent.       |
| `BILLING`           | Settings › Billing, pricing overlay, "Upgrade", "Free" badge, SSO toggle (opens pricing)                                                                             | No payment provider. Usage numbers are real counts; plan and checkout are not.                  |
| `SDK`               | Settings › Rewind SDK, the "Connect your domain" modal and its red dot, SDK Verify                                                                                   | No SDK exists. Verify always reports "not detected".                                            |
| `CLI_MCP`           | Settings › CLI and MCP, "+ Add other MCP client", MCP modal, Install › SDK/CLI/MCP                                                                                   | No CLI or MCP server exists. Token creation itself is real (see Accounts).                      |
| `WEBHOOKS`          | Settings › Webhooks                                                                                                                                                  | No delivery worker.                                                                             |
| `HELPDESK`          | Helpdesk nav item and page                                                                                                                                           | Buttons only link out to Intercom and other helpdesks.                                          |
| `SUPPORT_WIDGET`    | Support bubble, its Home, Messages, Chat and Status panels; Help › Report an issue, Contact support, System status                                                    | No support inbox or status source. Chat messages are stored, the reply is canned, bars fixed.   |
| `EMAIL`             | Settings › Notifications toggles and "Turn off all"; invite-by-email sending                                                                                         | No mail provider. Preferences are stored; nothing is sent. Invites still work by link.          |
| `SSO_AUDIT_AUTODEL` | Settings › General SSO, Audit logs and Auto-delete toggles                                                                                                           | Stored only. No IdP, no audit log writer, no deletion job.                                      |
| `EXTERNAL_LINKS`    | Help › Docs, Security, Blog, Install iOS app; extension-menu Docs; "View docs"; "Contact sales"                                                                      | Target pages do not exist; the design only toasts.                                              |

Everything not in this table is real and ships ungated.

## Accounts (schema change, approved)

New tables in `src/db/schema.ts`, one migration:

- `users`: id, email (unique, lower-cased), passwordHash, firstName,
  lastName, role (Engineering|Product|Design|QA|Support), avatarKey
  (MinIO key, nullable), theme (light|dark), notification prefs (5
  booleans, design's `n1`–`n5` defaults), createdAt.
- `workspaces`: id, name, logoKey (nullable), inviteCode (11 chars,
  unique), inviteLinkEnabled, restrictInvites, defaultLinkAccess
  (anyone|members|invited), aiEnabled, ssoEnabled, autoDelete,
  auditLogs, groupDuplicates, createdAt.
- `memberships`: workspaceId, userId, role (Admin|Creator|Viewer),
  lastActiveAt. Primary key (workspaceId, userId).
- `invites`: id, workspaceId, email, role, createdAt.
- `sessions`: id (random 32 bytes, stored as SHA-256 hash), userId,
  workspaceId (current workspace), expiresAt.
- `accessTokens`: id, userId, name, tokenHash, expiresAt, createdAt.
- `integrations`: workspaceId, name, connectedAt. Primary key both.
- `supportMessages`: id, userId, text, createdAt.
- `folders`, `recordingLinks`, `rewinds` gain `workspaceId` (not null,
  FK cascade). The migration creates a default workspace and assigns
  existing rows to it.
- `rewinds` gains `errorSignature` (nullable text, indexed).

Auth, stdlib only (`node:crypto`: `scrypt`, `randomBytes`,
`timingSafeEqual`), no new dependency:

- `POST /api/auth/signup` {email, password ≥ 8, firstName, lastName}:
  creates user, a workspace "<First>'s Workspace", Admin membership,
  session.
- `POST /api/auth/login` {email, password}, `POST /api/auth/logout`.
- Session cookie `rw_session`: HttpOnly, Secure in production,
  SameSite=Lax, 30 days.
- `src/lib/auth.ts`: `requireSession(req)` returns {user, workspace,
  role} or a 401 response. Also accepts `Authorization: Bearer <PAT>`.
- Every existing route is scoped to the session's workspace. Ids from
  another workspace return 404.
- `/r/[id]` and `GET /api/rewinds/[id]` stay public when the workspace's
  `defaultLinkAccess` is `anyone`; otherwise they need a member session.
- Pages other than `/r/[id]` and `/rec/[id]` redirect to `/login` with
  no session. `/login` is the design's logged-out card; with a
  remembered email (`rw_last_email` cookie, not HttpOnly) it shows
  "Continue as <email>" plus a password field; otherwise email and
  password, with a "Create account" switch. The design has no signup
  form: this is the smallest form in the card's style.
- The extension sends `credentials: "include"` from its background
  script (it holds host permission for the app), so the user's session
  cookie authorises uploads. Its e2e logs in first.

Workspace and member endpoints (all need a session; Admin-only marked
A):

- `GET/PATCH /api/workspace` (name, logo, toggles; PATCH A).
- `POST /api/workspace/logo` and `POST /api/me/avatar`: presigned PUT,
  image/png|jpeg|gif, 2 MB max, same pattern as `/api/uploads`.
- `GET /api/workspaces` (mine), `POST /api/workspaces` {name} (create
  and switch), `POST /api/workspaces/switch` {id}, `POST
  /api/workspaces/join` {inviteUrl or code}. Invalid code: 400 "That
  invite link isn't valid".
- `POST /api/workspace/invite-code/reset` (A).
- `GET /api/members`, `PATCH/DELETE /api/members/[userId]` (A; the last
  Admin cannot be removed or demoted: 409).
- `POST /api/invites` {emails: string[], role}: validates each email,
  stores invites (restrictInvites: A only). A matching signup joins the
  workspace.
- `GET/PATCH /api/me` (names, role, theme, notification prefs),
  `DELETE /api/me` (deletes the user and their memberships; a workspace
  left with no member is deleted).
- `GET/POST /api/tokens`, `DELETE /api/tokens/[id]`: POST returns the
  plaintext once; the UI copies it.
- `GET /api/usage`: counts of Rewinds and recording links in the
  workspace, against the design's Free limits (30, 5, 20).
- `POST/DELETE /api/integrations/[name]` (flag `INTEGRATIONS`).
- `GET/POST /api/support/messages` (flag `SUPPORT_WIDGET`).

## Error signature

`src/lib/signature.ts`, pure:

`errorSignature(events)`: take the first event with `isError`. From its
text take the first line, then: strip a leading `Uncaught `; replace
quoted strings with `"…"`, numbers with `N`, hex ids and UUIDs with
`ID`, URLs with their path, collapse whitespace, lower-case. If a later
line looks like a stack frame (`at fn (file:line:col)` or
`fn@file:line:col`), append ` @ fn file` without line and column.
Return `null` when there is no error event. `POST /api/rewinds` stores
it; the migration back-fills existing rows. The design's `sig` is this
value.

- Grid: with `groupDuplicates` on, one card per signature, stacked
  shadow, "N similar" badge (design's `stacked`), newest on top.
  Rewinds with a null signature never group.
- Viewer Summary: "N Rewinds share this error" lists the others with
  the same signature (real, ungated).

## Screens (design route → Next route)

- `all` → `/` (exists). Add: workspace menu (Settings, Switch workspace
  submenu, Join or create workspace, Log out), Recording links and
  Helpdesk nav, Group duplicates toggle (persists to
  `workspaces.groupDuplicates`), Invite button, New Rewind button
  (opens the extension if installed, else the Chrome Web Store link;
  see Ambiguities), Get started card (4 checks from real data: extension
  used = any Rewind by this user; first Rewind; integration connected
  (flag); invite sent), Help menu with Install submenu, support bubble
  (flag), Settings shortcut, avatar in the top bar.
- `viewer` → `/r/[id]` (exists). Tabs become Summary, Actions,
  Console, Network, Comments N. Summary: AI blocks (flag), Steps to
  reproduce (existing derivation), similar Rewinds (real), Merge
  (flag). Header adds Send to Linear (flag). Header meta line shows the
  real browser, OS and viewport when the capture has them; otherwise
  omit those parts.
- `links` → `/links`: table (Link, Created, Recordings count), New
  recording link (creates "New recording link N", copies
  `<origin>/rec/<id>`), Copy link per row, onboarding modal on first
  visit (dismissal stored per user in `localStorage`), domain button
  (flag `SDK`). `GET /api/recording-links` adds `rewindCount` and is
  workspace-scoped. Empty state: the table with one row "No recording
  links yet".
- `/rec/[id]` (public): "Ready to record?" card, Start recording with
  `getDisplayMedia` (video only), stop, upload through `/api/uploads`
  and `POST /api/rec/[id]/rewinds` (public, takes the link id instead
  of a session, files into the link's workspace, title "Recording from
  <link name>"). Unknown id: 404 page. Recorder errors (permission
  denied, upload failed) show inline with Retry.
- `helpdesk` → `/helpdesk` (flag `HELPDESK`).
- `settings` → `/settings/[tab]` for the 10 tabs, left nav as the
  design's `snav`. Account tab name shows the user's full name.
- Overlays: palette (exists; add the design's extra commands: Recording
  links, Helpdesk (flag), Invite teammates, Workspace settings,
  Integrations (flag), Members, Billing (flag), View pricing (flag)),
  invite modal, workspace modal, token modal, MCP modal (flag), pricing
  (flag), domain modal (flag), links onboarding.
- Viewer, extension popup, recorder bar and editor already exist in
  `apps/extension`; the design's in-app mock of them is not duplicated
  in the web app.

## States

- Loading: server components render data, so a page has no spinner.
  Client writes are optimistic with revert and an error toast (current
  pattern). Buttons that wait on the network (login, signup, upload,
  create token, join) disable and show "…" while pending.
- Empty: board column "Drop Rewinds here" (exists), library with no
  Rewinds ("No Rewinds yet" in the grid area), palette "No results"
  (exists), integrations search "No apps match that search.", tokens
  list hidden when empty, messages "No messages".
- Error: API errors toast with the server's message; 401 on a client
  write redirects to `/login`.

## Seed

`seed()` stays insert-if-missing by fixed id. Add: user
`dhiazfathra@gmail.com` / password `rewind-dev` (local only, printed by
`seed-cli.ts`), first name Dhiaz, last name Fathra; workspace "Dhiaz's
Workspace" (invite code `RsSg6prV8T8`); members Maya Chen
(maya@acme.co, Creator), Leo Park (leo@acme.co, Creator), Sara Ali
(sara@acme.co, Viewer), with passwords `rewind-dev`; integrations Linear
and Slack connected; recording links "Support: checkout issues" (6
Rewinds) and "Beta testers" (14): add the missing Rewinds as filler
rows with events whose first error gives each link a mix of
signatures; events on r2 and r3 with the same TypeError as r1 so the
three group, matching the design's `sig:'total'`. All existing rows get
the seeded workspace.

## Testing

Vitest 100% coverage stays. Every route: happy path, 401, 403 (non
Admin), 404 cross-workspace, 400 validation. `signature.ts` table test.
Playwright: sign up, log in, log out; create workspace and switch;
invite by link and join; recording link create, then `/rec/[id]`
records with the fake media flags (see `learning/MEMORY.md`) and the
Rewind appears with the link's tag; group duplicates on/off; settings
tabs render with flags on; flagged elements absent with flags off.

## Ambiguities (to confirm; defaults applied)

- New Rewind button: the web app cannot open an extension popup. It
  opens the extension's recorder page when the extension answers a
  `chrome.runtime` ping, else shows the install link. The design's
  in-page popup mock is not built.
- Extension auth: relies on the session cookie being sent from the
  extension's background fetch. If Chrome drops it, fall back to a PAT
  pasted in the extension's settings.
- `/login`'s password field is not in the design.
- "Default link access" = members or invited: invited has no invite
  per Rewind in the design; treated the same as members.

## Build order and commits

Each chunk is one commit pushed to `main`, tests and lint green:

1. Flags module and `.env.example`.
2. Schema, migration, auth lib and routes, workspace scoping of
   existing routes, `/login`.
3. Signature lib, back-fill, group duplicates, viewer tabs.
4. Recording links page, `/rec/[id]`, `rewindCount`.
5. Shell: workspace menu, Get started, Help, invite and workspace
   modals, palette commands.
6. Settings tabs and their APIs.
7. Flagged screens: helpdesk, support, pricing, SDK, CLI/MCP,
   integrations, Send to Linear, AI blocks.
8. Seed.
9. Extension: credentials include, e2e login.

# Rewind

Rewind is a jam.dev-style bug-reporting tool: a browser extension captures
a screenshot or video of a page together with its console, network, and
user events; the web app stores each capture as a Rewind and shows it as a
shareable report. UI source of truth is `docs/design/Rewind.dc.html`
(Claude Design project `9bb10f93-f534-4e75-831a-253a96666114`); see
`SPEC-design-parity.md` for the mapping from design to routes and
`CAPABILITY-MAP.md` for the module breakdown (superseded on scope by
`SPEC-design-parity.md` — see the note there).

## Features

- **Capture**: the Chrome/Firefox extension (`apps/extension`) records a
  screenshot, tab/desktop/area video, or an instant replay of the last few
  seconds, together with console, network, and user-event timelines.
- **Library** (`/`): grid, list, and board views of a workspace's Rewinds,
  folders with drag-and-drop, rename/delete with Undo, a `⌘K` command
  palette, dark mode, and "group duplicates" (Rewinds sharing the same
  `errorSignature` collapse into one stacked card).
- **Viewer** (`/r/[id]`): the recording or screenshot, comment pins on the
  timeline, and Summary/Actions/Console/Network/Comments tabs, plus a list
  of other Rewinds sharing the same error signature.
- **Recording links** (`/links`, `/rec/[id]`): a public page that records
  a visitor's screen with `getDisplayMedia` and files the result as a
  Rewind tagged with the link's name — no login needed to record.
- **Accounts and workspaces**: sign up, log in, log out; multiple
  workspaces per user with switch/join/create; members with Admin,
  Creator, and Viewer roles; invite by link or (behind a flag) by email;
  personal access tokens for the `Authorization: Bearer` API.
- **Settings** (`/settings/[tab]`): Account, General, Members, and eight
  more tabs mapped from the design — several are gated behind feature
  flags (below) because they have no real backend yet.

## Feature flags

Every flag in `apps/web/src/lib/flags.ts` defaults OFF and turns on only
when its `NEXT_PUBLIC_FLAG_<NAME>` env var is exactly `"1"` (see
`.env.example`). Each one gates a screen or control that matches the
design pixel-for-pixel but has no real backend behind it yet, so turning
one on ships a UI with no working integration until that backend exists:

| Flag | Gates | Why it's off |
| --- | --- | --- |
| `AI_SUMMARY` | Viewer's AI summary block | No AI provider is wired up. |
| `SIMILAR_MERGE` | "Merge similar Rewinds" action | No merge logic exists yet; grouping by `errorSignature` (ungated) is read-only. |
| `INTEGRATIONS` | Send to Linear, integrations settings, editor destination picker, "Connect an integration" checklist item | No OAuth with Linear, Jira, GitHub, or Slack. Connect state is stored; nothing is sent. |
| `BILLING` | Settings › Billing, pricing overlay, "Upgrade", "Free" badge, SSO toggle | No payment provider. Usage numbers are real counts; plans and checkout are not. |
| `SDK` | Settings › Rewind SDK, "Connect your domain" modal, SDK Verify | No SDK exists. Verify always reports "not detected". |
| `CLI_MCP` | Settings › CLI & MCP, MCP modal, Install › SDK/CLI/MCP | No CLI or MCP server exists. Token creation itself is real. |
| `WEBHOOKS` | Settings › Webhooks | No delivery worker. |
| `HELPDESK` | Helpdesk nav item and page | Buttons only link out to Intercom/other helpdesks. |
| `SUPPORT_WIDGET` | Support bubble (Home, Messages, Chat, Status), Help › Report an issue / Contact support / System status | No support inbox or status source. Messages are stored; replies are canned. |
| `EMAIL` | Settings › Notifications toggles, invite-by-email sending | No mail provider. Preferences are stored; nothing sent. Invites still work by link. |
| `SSO_AUDIT_AUTODEL` | Settings › General SSO, Audit logs, Auto-delete toggles | Stored only. No IdP, no audit log writer, no deletion job. |
| `EXTERNAL_LINKS` | Help › Docs/Security/Blog/Install iOS app, extension-menu Docs, "Contact sales" | Target pages don't exist; these only show a toast. |

Everything not in this table is real and ships ungated.

## Login and seed credentials

`bun run db:seed` inserts sample data if it's missing, without touching
existing rows. It creates:

- Admin user `dhiazfathra@gmail.com` / password `rewind-dev` (also
  printed by `bun run --filter web db:seed` via `seed-cli.ts`), in
  workspace **Dhiaz's Workspace** (invite code `RsSg6prV8T8`).
- Members Maya Chen (`maya@acme.co`, Creator), Leo Park (`leo@acme.co`,
  Creator), and Sara Ali (`sara@acme.co`, Viewer) — all password
  `rewind-dev`.
- Linear and Slack marked as connected integrations.
- Recording links "Support: checkout issues" (6 Rewinds) and "Beta
  testers" (14 Rewinds), some sharing an error signature so "group
  duplicates" has something to group.

Log in at `/login` with any of the accounts above. These credentials are
for local development and CI e2e only — never reuse them anywhere real.

## How to run

```
nvm use && bun install && cp .env.example apps/web/.env.local
docker compose up -d              # MinIO on :9000
bun run db:migrate
bun run db:seed
bun run dev                       # next dev on :3000, wxt dev in parallel
```

See `docs/STACK.md` for the full command reference (test, lint,
typecheck, e2e, build) and project layout.

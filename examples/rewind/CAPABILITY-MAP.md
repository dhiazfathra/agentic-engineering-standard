# Capability Map: Rewind v1

Rewind is a jam.dev-style bug reporter. The extension captures the page (a
screenshot or a video) together with its console, network and user events.
The web app stores each capture as a Rewind and shows it as a shareable
report. The UI source of truth is the Claude Design project
`9bb10f93-f534-4e75-831a-253a96666114`, file `Rewind.dc.html`.

Approved by the user on 2026-09-23.

| Module id         | Responsibility                                                                                                                                                                                            | Depends on    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `infra`           | Node 24, Bun workspace, the `apps/web`, `apps/extension` and `packages/schema` skeletons, MinIO in Docker, the Turso client and migrations, env validation, design tokens and fonts, the Vercel project   | —             |
| `rewinds-api`     | Turso schema (rewinds, events, comments, folders, recording links), presigned upload and finalize, CRUD route handlers, the shared capture schema in `packages/schema`, seeders                           | `infra`       |
| `viewer`          | `/r/[id]`: video or screenshot, comment pins on the timeline, console, network, events and info tabs, steps to reproduce built from user events, copy link                                                | `rewinds-api` |
| `extension`       | Manifest V3 for Chrome and Firefox: screenshot, tab, desktop and area recording, microphone, time delay, console, network and user-event capture, instant replay, drafts, the post-capture editor, upload | `rewinds-api` |
| `library`         | All Rewinds in grid, list and board views, folders, drag and drop, rename and delete with undo, the `⌘K` palette, dark mode                                                                               | `rewinds-api` |
| `recording-links` | Create a link. The public `/rec/[id]` page records with `getDisplayMedia` (video only, no logs) and files the result as a Rewind tagged with the link name                                                | `rewinds-api` |

Build order: `infra` → `rewinds-api` → `viewer` → `extension` → `library`
→ `recording-links`. The viewer comes before the extension, so seeded data
proves the storage-to-screen path before any capture code exists.

## Deferred to a later iteration

These appear in the design but need accounts or outside services:

- Auth, workspaces, members, invite links, SSO, audit logs
- Billing, pricing, plan usage
- AI summary, likely root cause, duplicate grouping, similar Rewinds
- Linear, Jira and other integrations, webhooks
- Rewind SDK, CLI, MCP, personal access tokens
- Helpdesk page, support widget, status page
- MinIO on a VM or VPS (v1 runs MinIO on this PC; see `SPEC-infra.md`)

Settings in v1 is only what works without accounts: appearance, and the
extension's own settings.

## Specs

One spec per module, written in build order, each approved before its
plan: `SPEC-infra.md`, then `SPEC-rewinds-api.md`, and so on.

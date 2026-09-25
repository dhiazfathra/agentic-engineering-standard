# Memory

Durable facts about this project that the code does not show: decisions,
constraints, gotchas, and external pointers. One line per fact, dated.
Update a line when it changes and delete it when it is wrong.

<!-- - 2026-01-01 Fact. Why it matters. -->

- 2026-09-23 Created from the `opinionated` template by `scripts/new-project.sh`.
- 2026-09-23 Lessons from this project feed back into `../../templates` through the learn skill's promote step.
- 2026-09-23 UI source of truth: Claude Design project `9bb10f93-f534-4e75-831a-253a96666114`, file `Rewind.dc.html`. Read it with DesignSync `get_file` after `/design-login`.
- 2026-09-23 Turso cloud DB `rewind` exists in `aws-ap-northeast-1` (`libsql://rewind-dhiazfathra.aws-ap-northeast-1.turso.io`). No token yet.
- 2026-09-23 Styling is CSS Modules plus the design's CSS variables, not Tailwind: the design is plain CSS over `_ds` and `--rw-*` tokens, so it ports as written. `create-next-app` defaults to Tailwind; pass `--no-tailwind`.
- 2026-09-23 v1 deploys to Vercel but keeps MinIO on this PC. Presigned URLs work from Vercel; server-to-MinIO calls do not. MinIO moves to a VPS next iteration.
- 2026-09-23 Bun 1.4.2 is the package manager and script runner, not pnpm (user decision). Node 24 stays the runtime; Vitest stays the test runner.
- 2026-09-23 Vercel: CLI logged in as `envisionlab-ai`; project `rewind` goes under team `envision-labs-projects-71c0945a`, root `examples/rewind/apps/web`.
- 2026-09-23 Deviations from SPEC-infra, each recorded in its commit: ESLint 9.39.5 not 10; fonts via `next/font/google` instead of copied `.ttf` files; `parseEnv` lives in `parse-env.ts` so `drizzle.config.ts` can reuse it.
- 2026-09-23 MinIO CORS origins come from `S3_CORS_ORIGINS` (default `http://localhost:3000`). Add the Vercel domain when it exists.
- 2026-09-23 Vercel project `rewind` created and linked (team envision-labs-projects-71c0945a, root examples/rewind/apps/web). Production alias: https://rewind-ecru.vercel.app. GitHub connected; pushes to main deploy. Ignored build step: `git diff --quiet HEAD^ HEAD -- .`.
- 2026-09-23 Turso cloud database migrated (0000_init baseline). Vercel env vars set for production/preview/development: DATABASE_URL, DATABASE_AUTH_TOKEN (production only), S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.
- 2026-09-23 `rewinds-api` built on branch `fm/rewinds-api-r1`: schema, `packages/schema` contracts, routes under `apps/web/src/app/api/`, `bun run db:seed`. Media-key contract in `docs/adr/0001-server-owned-media-keys.md`.
- 2026-09-23 TypeScript is pinned to 5.9.3, not 7.0.2: typescript-eslint cannot run on TS 7. Move to 7 once typescript-eslint supports it, and run lint when you do.
- 2026-09-23 libsql enforces foreign keys by default (no `PRAGMA foreign_keys` needed). Its errors carry `extendedCode` (`SQLITE_CONSTRAINT_FOREIGNKEY`, `SQLITE_CONSTRAINT_UNIQUE`), sometimes on the `.cause` of a drizzle wrapper; `apps/web/src/lib/http.ts` walks the cause chain and maps those to 400/404/409.
- 2026-09-23 This PC's port 9000 may be held by another project's MinIO. Run Rewind's under its own compose project with a port override, and point the e2e at it: `S3_ENDPOINT=http://localhost:9100 bun run --filter web e2e` (Playwright honors a real `S3_ENDPOINT`).
- 2026-09-23 Seeded Rewinds have no real object in MinIO (seed has no S3 dependency); the viewer must render a missing-media state for them. `seed()` inserts missing rows by fixed id (`onConflictDoNothing`) instead of delete-then-insert or update-on-conflict, so re-seeding only restores deleted sample rows. It never cascades away user comments/events on seeded Rewinds, nulls a user Rewind's `folderId` via the folders FK's `ON DELETE SET NULL`, or reverts user edits to seeded rows.
- 2026-09-24 `viewer` built on branch `fm/rewind-viewer-v1` (`SPEC-viewer.md`). The server signs a media `GET` URL and never checks the object; the browser's load error shows "Media unavailable". Tabs follow the capability map (Info, Events, Console, Network, Comments), not the design's AI Summary tab. Comment author is free text remembered in `localStorage`. `extension` is next.
- 2026-09-24 Headless Playwright Chromium (`channel: "chromium"`) can drive `getDisplayMedia` with `--auto-select-tab-capture-source-by-title=<title>` plus `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`; VP8/VP9 `VideoEncoder`, `MediaRecorder` and `MediaStreamTrackProcessor` all work there. The calling page must be a secure context: `data:` URLs have no `navigator.mediaDevices`, a routed `http://localhost` page does.
- 2026-09-24 `extension` built on branch `fm/rewind-extension-e1` (`SPEC-extension.md`). No API change: it files through `/api/uploads` and `/api/rewinds`. Firefox builds as MV3 (`.output/firefox-mv3`) and records the desktop only (no `tabCapture`). Its e2e starts the web app on :3200 with `ext-e2e.db`. `docs/extension-manual-check.md` lists what only a person can check. `library` is next.
- 2026-09-24 Library delete toasts have no timer (user decision): the `DELETE` is sent only when the user closes the toast with `×`, or leaves the page (flushed with `keepalive`). Undo sends nothing. Do not add an auto-dismiss. See `SPEC-library.md`.
- 2026-09-24 `library` shipped on `fm/rewind-library-l1` (`SPEC-library.md`): grid/list/board views, folders, drag and drop, `⌘K` palette, dark mode via `rw-dark` on `<body>` (`src/lib/theme.ts`, `THEME_INIT_SCRIPT` in `layout.tsx`). `e2e/library.spec.ts` reload assertions after a delete must close the toast first (`role="button", name: "Close"`) — the deferred `DELETE` is not guaranteed to land before `page.reload()` otherwise, so the item can reappear.
- 2026-09-25 User decision: `Rewind.dc.html` supersedes `CAPABILITY-MAP.md` as source of truth; deferred items (accounts, workspaces, billing, AI, integrations, settings) are in scope. Elements with no real backend are built but gated by feature flags defaulted OFF. Account schema changes approved. Viewer tabs change to the design's. Delete toasts keep no timer. Plan: `SPEC-design-parity.md`.

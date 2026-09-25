# Stack

- Next.js fullstack, deployed on Vercel
- Turso (libSQL) for the database
- Self-hosted MinIO for blob storage only
- Bun as the package manager and script runner

Use `bun install`, `bun add`, `bun run`, and `bunx`. Never use npm, npx,
pnpm, or yarn. The `bun-only.sh` PreToolUse hook blocks them, and
`.gitignore` drops their lockfiles. Commit `bun.lock` only.

The rationale is in `diagrams/stack-comparison.html`. This stack is the
only option compared there that moves the wall already hit out of the way
without adding a second architectural seam.

## Commands

All commands run from the project root unless noted. Pin Node in
`.nvmrc` and run `nvm use` first — a non-interactive shell does not pick
it up on its own.

```
Setup:      nvm use && bun install && cp .env.example apps/web/.env.local
Infra up:   docker compose up -d        # MinIO console on :9001
Infra down: docker compose down         # add -v to wipe the bucket
Migrate:    bun run db:migrate          # drizzle-kit migrate against DATABASE_URL
Dev:        bun run dev                 # next dev and wxt dev, in parallel
Dev (FF):   bun run --filter extension dev:firefox
Test:       bun run test                # vitest run --coverage in every package
E2E:        bun run e2e                 # Playwright: web against next start, extension loads unpacked
Lint:       bun run lint                # eslint . in every package
Typecheck:  bun run typecheck           # tsc --noEmit in every package
Build:      bun run build               # next build; wxt build (chrome-mv3, firefox-mv2)
```

Stay on TypeScript 5.x until typescript-eslint supports TypeScript 7: the
native TS 7 has no JS compiler API, so `bun run lint` fails in every
package. After any toolchain bump, run `lint` and `typecheck` even when no
`.ts` file changed.

## Environment

List every variable in `.env.example`, with local defaults and no
secrets. Parse `process.env` with zod at import time in one module (for
example `src/lib/env.ts`) and import that everywhere else, so a missing
or invalid variable fails fast with its name.

Vercel cannot reach a MinIO that runs only on a dev machine: signing an
upload or download URL is local math and works from Vercel, but a
server-side call to MinIO (checking or deleting a blob) does not. Point
`S3_ENDPOINT` at `http://localhost:9000` in every environment until MinIO
moves to a reachable host, and have a health check report storage as
unreachable from Vercel — that is the true state, not a bug.

## Deploy

Link the Vercel project with its root directory set to the app's
package inside the workspace, and connect it to the GitHub repo so
pushes to the default branch deploy. In a monorepo, set an ignored build
step (for example `git diff --quiet HEAD^ HEAD -- <project-dir>`) so a
push that does not touch the project skips its deploy.

## Server-rendered client components

A `"use client"` component still renders once on the server. Two things
break when it hydrates:

- Media `error` events do not bubble, so a `<video>` or `<img>` whose
  `src` fails before hydration never reaches React's `onError`. Set
  `src` in an effect after mount when the missing-media state matters.
- The current time and locale formatting (`Date.now()`,
  `toLocaleString()`) differ between the server (UTC on Vercel) and the
  browser. Render them in a `<time dateTime>` with
  `suppressHydrationWarning`, or format them after mount.
- Browser-only state (`localStorage`, a class set on `<body>` by an
  inline script) read in a `useState` initializer differs between the
  server render and the first client render. Read it with
  `useSyncExternalStore` and a server snapshot, or after mount.

## Drizzle

- In a single-table `select` (no joins) or a `returning` list, Drizzle's
  SQLite dialect strips the table name from every column interpolated
  into the projection, including inside a `sql` tag. So a correlated
  subquery in the projection, `${events.rewindId} = ${rewinds.id}`,
  becomes `"rewindId" = "id"`, `id` binds to the inner table's own
  column, and the count is silently 0. Joined selects and `where`
  clauses keep the qualifier. Write both sides qualified by hand
  (`"events"."rewindId" = "rewinds"."id"`) and assert the value against
  a real database, not a mocked `db`.

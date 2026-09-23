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

All commands run from `examples/rewind/` unless noted. Node 24 is pinned
in `.nvmrc` — run `nvm use` first, since a non-interactive shell does not
pick it up on its own.

```
Setup:      nvm use && bun install && cp .env.example apps/web/.env.local
Infra up:   docker compose up -d        # MinIO on :9000, console on :9001
Infra down: docker compose down         # add -v to wipe the bucket
Migrate:    bun run db:migrate          # drizzle-kit migrate against DATABASE_URL
Seed:       bun run db:seed             # design's sample rewinds; idempotent (upsert, keeps user data)
Dev:        bun run dev                 # next dev on :3000 and wxt dev, in parallel
Dev (FF):   bun run --filter extension dev:firefox
Test:       bun run test                # vitest run --coverage in every package
E2E:        bun run e2e                 # Playwright: web against next start, extension loads unpacked
Lint:       bun run lint                # eslint . in every package
Typecheck:  bun run typecheck           # tsc --noEmit in every package
Build:      bun run build               # next build; wxt build (chrome-mv3, firefox-mv2)
```

## Project structure

```
examples/rewind/
  .nvmrc                   24
  package.json             private root; bun workspaces apps/*, packages/*
  bun.lock                 the one lockfile; bun-only.sh blocks npm/pnpm/yarn
  docker-compose.yml       MinIO (quay.io/minio/minio, pinned) + a one-shot bucket-creation job
  .env.example             every variable, with local defaults, no secrets
  apps/
    web/                   Next.js 16.3.6, App Router
      src/app/api/         rewinds, folders, recording-links, uploads, health routes
      src/lib/             env.ts, parse-env.ts, db.ts, storage.ts, http.ts (request parsing, DB error mapping)
      src/db/              schema.ts, seed.ts (row builder) + seed-cli.ts (entry point)
      src/styles/          tokens.css (copied from the design), fonts.ts (next/font/google)
      drizzle/             generated SQL migrations
      e2e/                 Playwright specs (health, design tokens, rewinds upload flow)
    extension/             WXT, Chrome and Firefox from one codebase
      entrypoints/         background.ts, popup/
      tests/               Vitest specs (WXT reads entrypoints/ as entrypoints, so tests live here)
      e2e/                 Playwright: loads the Chrome build unpacked
  packages/
    schema/                shared zod request/response contracts for the rewinds API
  docs/
    STACK.md               this file
    design/                Rewind.dc.html, a reference copy of the design
```

## Environment

`.env.example` lists every variable with local defaults. `apps/web/src/lib/env.ts`
parses `process.env` with zod at import time and fails fast, naming every
invalid variable.

| Variable              | Local                   | Vercel                                                    |
| --------------------- | ----------------------- | --------------------------------------------------------- |
| `DATABASE_URL`        | `file:local.db`         | `libsql://rewind-dhiazfathra.aws-ap-northeast-1.turso.io` |
| `DATABASE_AUTH_TOKEN` | unset                   | Turso token, production only, never in a file             |
| `S3_ENDPOINT`         | `http://localhost:9000` | `http://localhost:9000` (MinIO stays on this PC)          |
| `S3_BUCKET`           | `rewind`                | `rewind`                                                  |
| `S3_ACCESS_KEY`       | `rewind`                | same                                                      |
| `S3_SECRET_KEY`       | local-only value        | same, production only                                     |

A real `S3_ENDPOINT` env var overrides the `.env.example` default for the
web e2e suite, so MinIO can run on remapped ports when 9000 is already
taken locally (`S3_ENDPOINT=http://localhost:9100 bun run --filter web e2e`).

## Deploy

The Vercel project `rewind` is linked with root directory
`examples/rewind/apps/web` and connected to this GitHub repo, so pushes to
`main` deploy. An ignored build step (`git diff --quiet HEAD^ HEAD -- .`)
skips deploys that don't touch this directory.

Production: <https://rewind-ecru.vercel.app>. `/api/health` reports
`"database":"ok"` there; `"storage":"unreachable"` is expected until MinIO
moves off this PC (see the note on Vercel-against-local-MinIO in
`../SPEC-infra.md`).

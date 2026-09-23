# Tasks: infra

Plan: `plan.md`. Spec: `../SPEC-infra.md`. All commands run from
`examples/rewind/` unless a task says otherwise.

## T1: Workspace root

**Description:** Create the Bun workspace root that every package hangs
off.

**Acceptance criteria:**

- [x] `.nvmrc` holds `24`. The root `package.json` is private, sets
      `packageManager: "bun@1.4.2"` and `workspaces: ["apps/*", "packages/*"]`,
      and defines `dev`, `test`, `e2e`, `lint`, `typecheck`, `build` and
      `db:migrate` as `bun run --filter` fan-outs.
- [x] `packages/schema` exists, with `package.json` and an `index.ts` that
      exports nothing yet.
- [x] `.gitignore` covers `bun` artefacts, `.output/` and `.wxt/`.

**Verification:**

- [x] `nvm use && bun install` exits 0 and writes `bun.lock`

**Dependencies:** None

**Files likely touched:** `.nvmrc`, `package.json`, `packages/schema/package.json`, `packages/schema/index.ts`, `.gitignore`

**Estimated scope:** S

## T2: Scaffold `apps/web`

**Description:** Generate the Next.js app and trim it to the spec.

**Acceptance criteria:**

- [x] `bunx create-next-app@16.3.6 apps/web --ts --app --src-dir --eslint --no-tailwind --use-bun --skip-install --import-alias "@/*"` ran, and the demo content is removed.
- [x] `vitest.config.ts` sets 100% thresholds on lines, branches,
      functions and statements, and lists every excluded path.
- [x] One render test covers `page.tsx`, and one covers `layout.tsx`.

**Verification:**

- [x] `bun run --filter web test` passes at 100%
- [x] `bun run --filter web build` exits 0

**Dependencies:** T1

**Files likely touched:** `apps/web/package.json`, `apps/web/vitest.config.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.test.tsx`

**Estimated scope:** M

## T3: Scaffold `apps/extension`

**Description:** Generate the WXT extension with a React popup
placeholder. Chrome and Firefox builds come from one codebase.

**Acceptance criteria:**

- [x] `bunx wxt@0.21.4 init apps/extension -t react --pm bun` ran, and
      the demo content is removed.
- [x] The popup renders the text `rewind`, and a Vitest test covers it at
      100%.
- [x] `package.json` has `dev`, `dev:firefox`, `build` (Chrome and
      Firefox), `test` and `typecheck`.

**Verification:**

- [x] `bun run --filter extension build` writes `.output/chrome-mv3` and `.output/firefox-mv2` (or `-mv3`)

**Dependencies:** T1

**Files likely touched:** `apps/extension/package.json`, `apps/extension/wxt.config.ts`, `apps/extension/entrypoints/popup/App.tsx`, `apps/extension/entrypoints/popup/App.test.tsx`, `apps/extension/vitest.config.ts`

**Estimated scope:** M

## Checkpoint A: after T1 to T3

- [x] `bun run lint`, `bun run typecheck`, `bun run test` and `bun run build` all exit 0
- [x] Commit `feat(rewind): scaffold bun workspace with web and extension` and push

## T4: `env.ts` with zod

**Description:** Parse and validate env once. Every other module imports
`env` instead of reading `process.env`.

**Acceptance criteria:**

- [x] `src/lib/env.ts` matches the spec's code style snippet.
- [x] `.env.example` lists every variable, with local defaults and no
      secrets.
- [x] Tests cover a valid env, each required variable missing, and a bad
      `S3_ENDPOINT`.

**Verification:**

- [x] `bun run --filter web test` passes at 100%

**Dependencies:** T2

**Files likely touched:** `apps/web/src/lib/env.ts`, `apps/web/src/lib/env.test.ts`, `.env.example`

**Estimated scope:** S

## T5: Turso client and Drizzle migrations

**Description:** Connect to libSQL through Drizzle, with a migration
pipeline that works on a local file and on Turso cloud.

**Acceptance criteria:**

- [x] `src/lib/db.ts` builds the client from `env.DATABASE_URL` and
      `env.DATABASE_AUTH_TOKEN`, and imports `server-only`.
- [x] `drizzle.config.ts` uses the `turso` dialect. `src/db/schema.ts` exists,
      empty until `rewinds-api`.
- [x] `db:migrate` runs `drizzle-kit migrate`.

**Verification:**

- [x] `bun run db:migrate` exits 0 against `file:local.db`
- [x] A unit test runs `select 1` through `db` on an in-memory libSQL database

**Dependencies:** T4

**Files likely touched:** `apps/web/src/lib/db.ts`, `apps/web/src/lib/db.test.ts`, `apps/web/drizzle.config.ts`, `apps/web/src/db/schema.ts`, `apps/web/package.json`

**Estimated scope:** M

## T6: MinIO in Docker and the S3 client

**Description:** Run MinIO locally with the `rewind` bucket created on
start. Point an S3 client at it.

**Acceptance criteria:**

- [x] `docker-compose.yml` runs `minio` on 9000 and 9001, with a named
      volume and a health check. A one-shot `mc` service creates the
      `rewind` bucket, and doing so twice is safe.
- [x] CORS allows `http://localhost:3000`, plus the Vercel domain once
      T11 sets `S3_CORS_ORIGINS`. The extension needs no entry, because
      `host_permissions` exempt extension pages from CORS.
- [x] `src/lib/storage.ts` exports `s3` (`forcePathStyle: true`), and
      imports `server-only`.

**Verification:**

- [x] `docker compose up -d`, then `docker compose wait mc` and `docker compose run --rm mc` both exit 0
- [x] A unit test asserts the client's endpoint and path style

**Dependencies:** T4

**Files likely touched:** `docker-compose.yml`, `apps/web/src/lib/storage.ts`, `apps/web/src/lib/storage.test.ts`, `.env.example`

**Estimated scope:** S

## T7: `/api/health`

**Description:** One route that reports whether the database and storage
answer.

**Acceptance criteria:**

- [x] The route matches the spec's snippet: 200 when both are `ok`, 503
      otherwise, and the body names each probe.
- [x] Unit tests cover all four ok and unreachable combinations, with the
      db and s3 clients stubbed.

**Verification:**

- [x] `bun run --filter web test` passes at 100%
- [x] `curl -i localhost:3000/api/health` gives 200, and gives 503 with `"storage":"unreachable"` after `docker compose stop minio`

**Dependencies:** T5, T6

**Files likely touched:** `apps/web/src/app/api/health/route.ts`, `apps/web/src/app/api/health/route.test.ts`

**Estimated scope:** S

## Checkpoint B: after T4 to T7

- [x] `bun run test` passes at 100%. `lint` and `typecheck` are clean
- [x] Spec success criteria 2, 3 (local) and 4 hold
- [x] Commit `feat(rewind): add env, turso, minio and health check` and push

## T8: Health e2e against real services

**Description:** Prove the stack end to end: a real server, a real file
database and the real MinIO container.

**Acceptance criteria:**

- [x] `playwright.config.ts` runs `next build && next start` as its web
      server, with `DATABASE_URL=file:e2e.db`.
- [x] `e2e/health.spec.ts` expects `200 {"database":"ok","storage":"ok"}`.

**Verification:**

- [x] With MinIO up, `bun run --filter web e2e` exits 0

**Dependencies:** T7

**Files likely touched:** `apps/web/playwright.config.ts`, `apps/web/e2e/health.spec.ts`, `apps/web/package.json`

**Estimated scope:** S

## T9: Design tokens and fonts

**Description:** Bring the design's visual base into the web app.

**Acceptance criteria:**

- [x] `src/styles/tokens.css` holds the `_ds_bundle.css` `:root` variables
      and the `--rw-*` light and `body.rw-dark` blocks from
      `Rewind.dc.html`, under a header naming the source.
- [x] Inter, Poppins and Instrument Serif load through `next/font/google`
      (`src/styles/fonts.ts`), the same families as the design's `.ttf`
      files. `layout.tsx` imports `tokens.css` and sets the font variables.
- [x] `docs/design/Rewind.dc.html` holds a reference copy.

**Verification:**

- [x] A Playwright test on `/` reads `--color-primary` and `--rw-accent` as `#01afaf`, and finds a loaded Inter face used by the body

**Dependencies:** T2, T8

**Files likely touched:** `apps/web/src/styles/tokens.css`, `apps/web/src/styles/fonts.css`, `apps/web/public/fonts/*`, `apps/web/src/app/layout.tsx`, `apps/web/e2e/design.spec.ts`

**Estimated scope:** M

## T10: Extension e2e (Chrome) and Firefox build check

**Description:** Load the built Chrome extension in a real browser, and
confirm that the Firefox build exists.

**Acceptance criteria:**

- [x] A Playwright persistent context launches Chromium with
      `--load-extension=.output/chrome-mv3`, reads the extension id from
      the service worker, opens `popup.html` and sees `rewind`.
- [x] `bun run --filter extension build` also produces the Firefox
      output. The test fails if that output is missing.

**Verification:**

- [x] `bun run --filter extension e2e` exits 0

**Dependencies:** T3

**Files likely touched:** `apps/extension/playwright.config.ts`, `apps/extension/e2e/popup.spec.ts`, `apps/extension/package.json`

**Estimated scope:** S

## Checkpoint C: after T8 to T10

- [x] `bun run e2e` exits 0. Spec success criteria 5 and 6 hold
- [x] Commit `test(rewind): add health, design and extension e2e` and push

## T11: Vercel project `rewind` and first deploy

**Description:** Link and deploy `apps/web` to Vercel, against Turso cloud.

**Acceptance criteria:**

- [ ] `vercel project add rewind --scope envision-labs-projects-71c0945a`
      creates the project, with root directory `examples/rewind/apps/web`,
      connected to the GitHub repo.
- [ ] Production env vars are set. `DATABASE_AUTH_TOKEN` is piped from
      `turso db tokens create rewind` and never printed.
- [ ] `bun run db:migrate` has run against Turso cloud.
- [ ] An ignored build step skips deploys that don't touch
      `examples/rewind`.

**Verification:**

- [ ] `curl https://<deploy>/api/health` returns `"database":"ok"` and `"storage":"unreachable"`, with status 503

**Dependencies:** T7, T9

**Files likely touched:** `apps/web/vercel.json`, `.gitignore` (`.vercel`)

**Estimated scope:** S

## T12: `docs/STACK.md` and promotion to the template

**Description:** Record the commands that now actually work, and promote
them to the opinionated template.

**Acceptance criteria:**

- [ ] `docs/STACK.md` lists every command in the spec's Commands section,
      each one verified in this module.
- [ ] `../../templates/opinionated/docs/STACK.md` gets the same commands,
      with no project names or project paths.
- [ ] If the template's scripts or hooks change, `../../tests/run.sh`
      changes in the same commit.

**Verification:**

- [ ] `bash ../../tests/run.sh` exits 0
- [ ] `prettier --check "**/*.md"` exits 0

**Dependencies:** T8, T10, T11

**Files likely touched:** `docs/STACK.md`, `../../templates/opinionated/docs/STACK.md`

**Estimated scope:** S

## T13: Try TypeScript 7.0.2

**Description:** Move to TypeScript 7 only if every build passes on it.

**Acceptance criteria:**

- [ ] With `typescript@7.0.2` in every package, `bun run typecheck`,
      `bun run build` and `bun run test` all exit 0. Then commit
      `chore(rewind): move to typescript 7`.
- [ ] Or, if any of them fail: revert, and record the failing command and
      its error in `learning/LESSONS.md`.

**Verification:**

- [ ] `git status` is clean, whichever outcome

**Dependencies:** T12

**Files likely touched:** `apps/web/package.json`, `apps/extension/package.json`, `packages/schema/package.json`, `bun.lock`

**Estimated scope:** S

## Checkpoint: infra complete

- [ ] All nine success criteria in `../SPEC-infra.md` hold, each with command output as evidence
- [ ] `/security-review`, `/performance` and `/documentation-and-adrs` have run. Their fixes are committed and pushed
- [ ] The learn skill updates `learning/`
- [ ] Human review before `SPEC-rewinds-api.md`

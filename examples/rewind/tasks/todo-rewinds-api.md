# Tasks: rewinds-api

Plan: `plan-rewinds-api.md`. Spec: `../SPEC-rewinds-api.md`. All commands
run from `examples/rewind/` unless a task says otherwise. Prefix commands
that run Node with `. ~/.nvm/nvm.sh && nvm use >/dev/null`.

## T1: `packages/schema` contracts

**Description:** The zod request bodies every client shares, and the id
helper.

**Acceptance criteria:**

- [ ] `packages/schema` depends on `zod` (same version as `apps/web`) and
      `nanoid`, and exports `newId()`, the enums (`rewindStatus`,
      `rewindKind`, `eventKind`), `mediaKeyPattern`, `uploadRequest`,
      `createRewind` (with `events`), `updateRewind` (at least one field,
      `folderId` nullable), `createComment` (`x`, `y` in 0..100, `t` >= 0),
      `createFolder`, `updateFolder`, `createRecordingLink`, and the
      inferred types.
- [ ] `createRewind` rejects a `mediaKey` that does not match
      `mediaKeyPattern`, and a screenshot with a duration.
- [ ] `packages/schema` has `test` (Vitest, 100% thresholds) and
      `typecheck` scripts. `apps/web` depends on `@rewind/schema`
      (`workspace:*`).

**Verification:** `bun run --filter @rewind/schema test` passes at 100%.

**Dependencies:** None

**Files likely touched:** `packages/schema/*`, `apps/web/package.json`, `bun.lock`

**Estimated scope:** S

## T2: Drizzle schema and migration

**Description:** Replace the placeholder schema with the spec's five
tables.

**Acceptance criteria:**

- [ ] `folders`, `recordingLinks`, `rewinds`, `events`, `comments` match
      the spec's data model. Ids are text with `$defaultFn(newId)`.
      Timestamps are integer `timestamp` mode.
- [ ] `events` and `comments` cascade on Rewind delete. `rewinds.folderId`
      and `rewinds.recordingLinkId` set null on parent delete.
- [ ] Drizzle `relations` let `db.query.rewinds.findFirst({ with: { events, comments } })` work.
- [ ] Migration `0001_*` comes from `bun run --filter web db:generate`,
      not hand-written.

**Verification:** `bun run db:migrate` exits 0 against `file:local.db`.

**Dependencies:** T1

**Files likely touched:** `apps/web/src/db/schema.ts`, `apps/web/drizzle/*`

**Estimated scope:** S

## T3: `POST /api/uploads`

- [ ] Parses `uploadRequest`, returns `{ url, key }`: a presigned
      `PutObjectCommand` URL, 15-minute TTL, content type signed in, key
      `rewinds/<newId()>.<ext>`.
- [ ] 400 on a bad body. Unit test with the presigner stubbed.

**Dependencies:** T1 · **Scope:** S

## T4: `/api/rewinds` GET and POST

- [ ] GET lists Rewinds newest first (row columns only; pagination is
      deferred to `library`).
- [ ] POST parses `createRewind`, inserts the Rewind and its events in
      one batch, returns 201 with the row. 400 on a bad body or an
      unknown `folderId` / `recordingLinkId`.

**Dependencies:** T1, T2 · **Scope:** M

## T5: `/api/rewinds/[id]` GET, PATCH, DELETE

- [ ] GET returns the Rewind with `events` and `comments`, each sorted by
      `t`. 404 when missing.
- [ ] PATCH parses `updateRewind`, bumps `updatedAt`. 404 missing, 400 bad
      body or unknown folder.
- [ ] DELETE removes the row (cascade), then tries `DeleteObjectCommand`
      in a `try/catch` that logs with `console.error` and still returns 200. 404 when missing.

**Dependencies:** T4 · **Scope:** M

## T6: `POST /api/rewinds/[id]/comments`

- [ ] Parses `createComment`, returns 201 with the row. 404 when the Rewind
      is missing, 400 on a bad body.

**Dependencies:** T5 · **Scope:** S

## T7: `/api/folders` and `/api/folders/[id]`

- [ ] GET lists, POST creates (201). PATCH renames, DELETE deletes; both
      404 when missing. Rewinds in a deleted folder keep existing with
      `folderId = null`.

**Dependencies:** T1, T2 · **Scope:** S

## T8: `/api/recording-links`

- [ ] GET lists, POST creates (201).

**Dependencies:** T1, T2 · **Scope:** S

### Checkpoint B

- [ ] `bun run test` at 100%, `bun run lint` and `bun run typecheck` exit 0
- [ ] Commit

## T9: `db:seed`

- [ ] `apps/web/src/db/seed.ts`, run by `bun run db:seed` (root and
      `apps/web`). Inserts the design's 3 folders, 2 recording links, 8
      Rewinds from `JAMS`, `EV` as events and `COMMENTS` as comments on
      the first Rewind, with fixed ids. Running it twice gives the same
      rows.
- [ ] The row-building logic is unit tested; the entry point stays thin.

**Dependencies:** T2 · **Scope:** S

## T10: Integration test

- [ ] One Vitest suite runs the real route handlers against a migrated
      temporary `file:` database: create → list → get → patch → delete a
      Rewind (with the cascade asserted), and folder and link CRUD.

**Dependencies:** T4–T8 · **Scope:** M

## T11: Upload e2e

- [ ] `apps/web/e2e/rewinds.spec.ts`: POST `/api/uploads`, `PUT` a small
      fixture to MinIO with plain `fetch`, POST a Rewind with the key,
      GET it back, and confirm the object exists in MinIO.

**Dependencies:** T3, T4 · **Scope:** S

## T12: Docs

- [ ] `docs/STACK.md` lists `db:seed` and the new routes directory.

**Dependencies:** T9 · **Scope:** XS

### Checkpoint: Complete

- [ ] All five success criteria in `SPEC-rewinds-api.md` hold, with evidence
- [ ] `/security-review`, `/performance`, `/documentation-and-adrs`
- [ ] The learn skill updates `learning/`

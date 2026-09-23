# Implementation Plan: rewinds-api

Module `rewinds-api` from `../CAPABILITY-MAP.md`. Spec:
`../SPEC-rewinds-api.md`. Tasks: `todo-rewinds-api.md`. `infra`'s
`tasks/plan.md` and `tasks/todo.md` stay as the record of that module;
this module gets its own files rather than overwriting them.

## Overview

Add the schema (`folders`, `recordingLinks`, `rewinds`, `events`,
`comments`), the shared zod contracts in `packages/schema`, presigned
uploads, full CRUD routes, and a seed script — the storage layer every
later module builds on.

## Architecture decisions

- **`packages/schema` holds the contract, not the DB shape.** Zod types
  for request/response bodies live there; Drizzle's inferred row types
  stay in `apps/web/src/db/schema.ts`. The extension never imports
  Drizzle.
- **One `nanoid()` helper in `packages/schema`.** `nanoid` is a single
  ~130-byte dependency; wrapping it in one helper means only one place
  changes if the id scheme ever does.
- **Delete is fire-and-forget on storage.** `DELETE /api/rewinds/[id]`
  removes the DB row first (the source of truth), then tries the S3
  delete in a `try/catch` that only logs — matches ADR-0011, and means a
  Vercel-side delete never blocks or fails the request.
- **The server owns the media key.** `POST /api/uploads` takes only a
  content type from an allowlist (`video/webm`, `video/mp4`,
  `image/png`, `image/jpeg`) and returns `rewinds/<nanoid>.<ext>`. One
  regex for that shape lives in `packages/schema`, and `createRewind`
  rejects any other `mediaKey` (spec Boundaries: never trust a client
  key outside this prefix). The content type is signed into the URL, so
  the client must `PUT` with the same `Content-Type`.
- **Foreign keys are on and tested.** SQLite enforces `onDelete` only
  with `PRAGMA foreign_keys = ON`. A test deletes a Rewind and asserts
  its events and comments are gone, and deletes a folder and asserts
  its Rewinds keep existing with `folderId = null`.
- **The seed script does not import `@/lib/db`.** `db.ts` imports
  `server-only`, which throws outside Next. `seed.ts` builds its own
  client from `parseEnv` after `loadEnvConfig`, as `drizzle.config.ts`
  does.
- **Seed script is idempotent.** `db:seed` deletes existing seed rows (by
  a fixed set of ids) before inserting, so running it twice is safe, the
  same property `infra`'s `mc mb --ignore-existing` and `db:migrate` have.

## Dependency graph

```
T1 packages/schema: zod contracts + nanoid ─────────────┐
T2 schema.ts: folders, recordingLinks, rewinds, events, comments, migration
 ├── T3 /api/uploads (presigned PUT)
 ├── T4 /api/rewinds (list, create) ── T5 /api/rewinds/[id] (get, patch, delete)
 │                                       └── T6 /api/rewinds/[id]/comments
 ├── T7 /api/folders + /api/folders/[id]
 └── T8 /api/recording-links
T2 + T1 ── T9 db:seed
T4,T5,T6,T7,T8 ── T10 integration test (full CRUD cycle)
T3 + T9 ── T11 upload-to-fetch e2e
T10 + T11 ── T12 STACK.md update if commands changed
```

## Task list

### Phase 1: Contract and schema

- [ ] T1: `packages/schema` — zod types, nanoid helper
- [ ] T2: Drizzle schema, migration

### Checkpoint A

- [ ] `bun run db:migrate` exits 0 against `file:local.db`
- [ ] Commit (the no-mistakes pipeline owns the push for this branch)

### Phase 2: Routes

- [ ] T3: `/api/uploads`
- [ ] T4: `/api/rewinds` (GET, POST)
- [ ] T5: `/api/rewinds/[id]` (GET, PATCH, DELETE)
- [ ] T6: `/api/rewinds/[id]/comments` (POST)
- [ ] T7: `/api/folders`, `/api/folders/[id]`
- [ ] T8: `/api/recording-links`

### Checkpoint B

- [ ] `bun run test` at 100% coverage; `lint` and `typecheck` clean
- [ ] Commit

### Phase 3: Seed and proof

- [ ] T9: `db:seed`
- [ ] T10: integration test — create → list → get → patch → delete, and
      folder/link CRUD, against a migrated temporary `file:` database
      (same engine as `file:local.db`, without clobbering the dev DB)
- [ ] T11: upload → finalize → fetch e2e against real MinIO
- [ ] T12: update `docs/STACK.md` if `db:seed` or other commands are new

### Checkpoint: Complete

- [ ] All five success criteria in `SPEC-rewinds-api.md` hold, with evidence
- [ ] Finishing steps: `/security-review`, `/performance`, `/documentation-and-adrs`
- [ ] The learn skill updates `learning/`
- [ ] Human review before `viewer` starts

## Risks and mitigations

| Risk                                                                         | Impact | Mitigation                                                                                                                       |
| ---------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Cascading deletes need `onDelete: "cascade"` on both FKs in SQLite/libSQL    | Med    | Set it explicitly in Drizzle's `references()`; cover with a test that deletes a Rewind and asserts its events/comments are gone. |
| A presigned PUT URL's SHA-signed headers mismatch what the test client sends | Med    | The e2e `PUT`s with plain `fetch` and the same `Content-Type` the URL was signed for, exactly what the extension will do.        |
| Nanoid collision or empty string breaks a route's zod `min(1)` check         | Low    | Nanoid's default alphabet and length (21 chars) make collision practical only after billions of ids; not a v1 concern.           |
| Seed script leaves orphaned S3 objects if MinIO isn't running                | Low    | Seed only writes DB rows referencing fixture keys; it does not upload anything, so no S3 dependency.                             |

## Corrections to the first draft

Checked against the approved spec on 2026-09-23:

- Added the server-owned media key and its prefix check (spec
  Boundaries); the draft did not cover it.
- Added the folder `onDelete: set null` and the foreign-key pragma risk.
- The e2e risk row suggested an SDK `fetch`; there is none. It now uses
  plain `fetch`, as a client would.
- Checkpoints commit only. This branch ships through no-mistakes, which
  pushes.
- The seed script cannot import `@/lib/db` (`server-only`).

## Open questions

None outstanding — spec's three questions are resolved and recorded there.

# Spec: rewinds-api

Module `rewinds-api` from `CAPABILITY-MAP.md`. Depends on `infra`
(shipped). Status: approved 2026-09-23 (nanoid ids, seed copies design data, pagination deferred to library).

## Objective

Turn a capture (video or screenshot, with its console/network/user
events) into a stored, queryable Rewind. This module has no UI beyond
what proves it: `viewer`, `extension`, `library` and `recording-links`
all build on the routes and schema here.

User stories:

- As a client (extension or a future recording-link page), I request an
  upload URL, `PUT` the media straight to MinIO, then post the Rewind's
  metadata and events to create the record.
- As a client, I list Rewinds, fetch one with its events and comments,
  rename it, move it to a folder, change its status, or delete it.
- As a client, I add a timestamped comment to a Rewind.
- As a developer, `bun run db:seed` gives me Rewinds to view without
  recording anything, matching the design's sample data.

## Data model

Modeled on the design's `JAMS`, `EV`, `COMMENTS`, `COLS` and folder/link
actions in `Rewind.dc.html`. Drizzle schema in `apps/web/src/db/schema.ts`,
replacing the placeholder from `infra`.

```
folders          id, name, createdAt
recordingLinks   id, name, createdAt
rewinds          id, title, url, reporterName, status, kind, mediaKey,
                 durationSeconds (null for screenshots), folderId (fk, null),
                 recordingLinkId (fk, null), createdAt, updatedAt
events           id, rewindId (fk), t (seconds, real), kind, text, isError
comments         id, rewindId (fk), t (seconds, real), x, y (0-100), author, text, createdAt
```

- `status`: `new | triage | progress | done` — the design's `COLS`.
- `kind`: `video | screenshot`.
- `event.kind`: `nav | click | input | net | log | warn | err` — the
  design's `EV[].k`.
- No `workspaces` or `users` table: v1 has no auth (user decision,
  2026-09-23). `reporterName` and comment `author` are free-text.
- Deleting a Rewind deletes its events and comments (`onDelete: cascade`)
  and best-effort deletes its blob — see Boundaries.

## API

All routes under `apps/web/src/app/api/`. Every body validated with a
zod schema from `packages/schema`, shared with `extension` later.

| Route                        | Method       | Does                                                                |
| ---------------------------- | ------------ | ------------------------------------------------------------------- |
| `/api/uploads`               | POST         | Returns a presigned `PUT` URL and object key for one media file     |
| `/api/rewinds`               | GET          | Lists Rewinds (id, title, status, folder, duration, createdAt, ...) |
| `/api/rewinds`               | POST         | Creates a Rewind from `{ ...fields, events: Event[] }`              |
| `/api/rewinds/[id]`          | GET          | One Rewind with its events and comments                             |
| `/api/rewinds/[id]`          | PATCH        | Updates title, status, or folderId                                  |
| `/api/rewinds/[id]`          | DELETE       | Deletes the Rewind and its rows; best-effort deletes the blob       |
| `/api/rewinds/[id]/comments` | POST         | Adds a comment `{ t, x, y, author, text }`                          |
| `/api/folders`               | GET,POST     | Lists folders; creates one                                          |
| `/api/folders/[id]`          | PATCH,DELETE | Renames; deletes (Rewinds in it fall back to no folder)             |
| `/api/recording-links`       | GET,POST     | Lists links; creates one                                            |

Presigned URLs expire in 15 minutes (`PutObjectCommand` + a short
`getSignedUrl` TTL) — long enough for a recording upload on a normal
connection, short enough that a leaked URL is useless soon after.

## Commands

No new commands. `db:seed` joins `db:migrate` in `apps/web/package.json`:
`bun run db:seed` (`tsx src/db/seed.ts`, or a plain `bun` run since Bun
executes TypeScript directly — no `tsx` dependency needed).

## Code style

```ts
// apps/web/src/app/api/rewinds/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rewinds } from "@/db/schema";
import { createRewind } from "@rewind/schema";

export async function POST(req: Request) {
  const parsed = createRewind.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const [row] = await db.insert(rewinds).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
```

- Route handlers stay thin: parse, call one `db` operation or a small
  `src/lib/rewinds.ts` helper, respond. No business logic in the schema
  file.
- Every schema in `packages/schema` is the single source the extension
  and web app both import — no duplicate zod definitions.

## Testing strategy

- Unit: schema validation (accepts/rejects), and each route handler with
  `db` and `s3` stubbed the way `route.test.ts` for `/api/health`
  already does. 100% coverage, same thresholds as `infra`.
- Integration: one Vitest suite runs the real route handlers against the
  local file database (no stubbing), covering create → list → get →
  patch → delete for a Rewind, and folder/link CRUD.
- E2E: extend `apps/web/e2e/` with a spec that requests an upload URL,
  `PUT`s a small fixture file to MinIO, posts a Rewind referencing it, and
  fetches it back — proving the whole pipeline against real services, the
  same pattern as `health.spec.ts`.

## Boundaries

- Always: validate every request body with zod; migrate the schema with
  `drizzle-kit generate` + `db:migrate`, never a hand-edited SQL file.
- Ask first: any schema change once `viewer` or `extension` depend on it.
- Never: trust a client-supplied `mediaKey` outside the prefix this
  module generates; delete a blob synchronously in the request path if
  storage is unreachable (log and continue — matches ADR-0011: DELETE
  removes the DB row even when the Vercel-side blob delete cannot run).

## Success criteria

1. `bun run db:seed` populates folders, recording links, and 5+ Rewinds
   with events and comments matching the design's sample shapes.
2. The full create → list → get → patch → delete cycle passes as an
   integration test against `file:local.db`.
3. The upload → finalize → fetch e2e passes against real MinIO.
4. `bun run test`, `lint`, `typecheck` all exit 0 at 100% coverage.
5. Deleting a Rewind whose blob is unreachable (MinIO stopped) still
   removes its DB row and returns 200, logging the storage failure.

## Decisions

Approved 2026-09-23: nanoid for ids; seed data copies the design's sample
content; `GET /api/rewinds` pagination deferred to `library`.

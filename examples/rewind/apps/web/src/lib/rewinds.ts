import { asc, desc, eq, sql } from "drizzle-orm";
import { comments, events, rewinds } from "@/db/schema";
import { db } from "@/lib/db";

/** The row shape shared by `GET /api/rewinds/[id]` and the viewer page. */
export async function getRewind(id: string) {
  return db.query.rewinds.findFirst({
    where: eq(rewinds.id, id),
    with: {
      events: { orderBy: asc(events.t) },
      comments: { orderBy: asc(comments.t) },
    },
  });
}

export type RewindDetail = NonNullable<Awaited<ReturnType<typeof getRewind>>>;

/**
 * Every Rewind, newest first, with `errorCount`: a correlated count of its
 * `isError` events, in one query (no N+1). Shared by the library page and
 * `GET /api/rewinds`.
 *
 * ponytail: no pagination, one query loads every row — fine for a few
 * hundred Rewinds; add LIMIT/cursor pagination past that ceiling.
 */
export async function listRewinds() {
  return db
    .select({
      id: rewinds.id,
      title: rewinds.title,
      url: rewinds.url,
      reporterName: rewinds.reporterName,
      status: rewinds.status,
      kind: rewinds.kind,
      mediaKey: rewinds.mediaKey,
      durationSeconds: rewinds.durationSeconds,
      folderId: rewinds.folderId,
      recordingLinkId: rewinds.recordingLinkId,
      createdAt: rewinds.createdAt,
      updatedAt: rewinds.updatedAt,
      // Column refs inside a `sql` tag render unqualified, so both sides of
      // the correlation are spelled out explicitly to avoid the subquery's
      // own `events.id`/`events.rewindId` shadowing the outer `rewinds.id`.
      errorCount: sql<number>`(
        select count(*) from ${events}
        where "events"."rewindId" = "rewinds"."id" and "events"."isError" = true
      )`.mapWith(Number),
    })
    .from(rewinds)
    .orderBy(desc(rewinds.createdAt));
}

export type RewindListItem = Awaited<ReturnType<typeof listRewinds>>[number];

/** Every folder. Shared by the library page and `GET /api/folders`. */
export async function listFolders() {
  return db.query.folders.findMany();
}

export type FolderListItem = Awaited<ReturnType<typeof listFolders>>[number];

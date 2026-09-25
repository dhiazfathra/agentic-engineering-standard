import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { comments, events, folders, rewinds } from "@/db/schema";
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
 * Every Rewind in a workspace, newest first, with `errorCount`: a correlated
 * count of its `isError` events, in one query (no N+1). Shared by the
 * library page and `GET /api/rewinds`.
 *
 * ponytail: no pagination, one query loads every row — fine for a few
 * hundred Rewinds; add LIMIT/cursor pagination past that ceiling.
 */
export async function listRewinds(workspaceId: string) {
  return db
    .select({
      id: rewinds.id,
      workspaceId: rewinds.workspaceId,
      title: rewinds.title,
      url: rewinds.url,
      reporterName: rewinds.reporterName,
      status: rewinds.status,
      kind: rewinds.kind,
      mediaKey: rewinds.mediaKey,
      durationSeconds: rewinds.durationSeconds,
      folderId: rewinds.folderId,
      recordingLinkId: rewinds.recordingLinkId,
      errorSignature: rewinds.errorSignature,
      createdAt: rewinds.createdAt,
      updatedAt: rewinds.updatedAt,
      // A single-table select strips table names from interpolated columns,
      // even inside a `sql` tag, so both sides of the correlation are spelled
      // out by hand; otherwise `id` binds to the subquery's own `events.id`.
      errorCount: sql<number>`(
        select count(*) from ${events}
        where "events"."rewindId" = "rewinds"."id" and "events"."isError" = true
      )`.mapWith(Number),
    })
    .from(rewinds)
    .where(eq(rewinds.workspaceId, workspaceId))
    .orderBy(desc(rewinds.createdAt));
}

export type RewindListItem = Awaited<ReturnType<typeof listRewinds>>[number];

/**
 * Other Rewinds in the same workspace that share `errorSignature`, newest
 * first. Backs the viewer's "N Rewinds share this error" list.
 */
export async function listSimilarRewinds(
  workspaceId: string,
  errorSignature: string,
  excludeId: string,
) {
  return db.query.rewinds.findMany({
    where: and(
      eq(rewinds.workspaceId, workspaceId),
      eq(rewinds.errorSignature, errorSignature),
      ne(rewinds.id, excludeId),
    ),
    orderBy: desc(rewinds.createdAt),
    columns: { id: true, title: true, reporterName: true, createdAt: true },
  });
}

export type SimilarRewind = Awaited<
  ReturnType<typeof listSimilarRewinds>
>[number];

/** Every folder in a workspace. Shared by the library page and `GET /api/folders`. */
export async function listFolders(workspaceId: string) {
  return db.query.folders.findMany({
    where: eq(folders.workspaceId, workspaceId),
  });
}

export type FolderListItem = Awaited<ReturnType<typeof listFolders>>[number];

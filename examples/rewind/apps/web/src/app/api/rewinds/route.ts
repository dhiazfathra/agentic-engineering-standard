import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createRewind, newId } from "@rewind/schema";
import { events, folders, recordingLinks, rewinds } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  isForeignKeyViolation,
  isUniqueViolation,
  parseBody,
} from "@/lib/http";
import { listRewinds } from "@/lib/rewinds";

export const dynamic = "force-dynamic";

// 6 bound params per event row; 1,000 rows keeps each statement under
// SQLite's 32,766-variable limit. All chunks share one db.batch, so a
// rewind's events still commit atomically.
const EVENTS_PER_INSERT = 1_000;

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const rows = await listRewinds(session.workspace.id);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, createRewind);
  if (parsed instanceof NextResponse) return parsed;

  const { events: rewindEvents, folderId, recordingLinkId, ...fields } = parsed;
  const workspaceId = session.workspace.id;

  // A folder/recording-link id from another workspace must 400, the same as
  // an id that doesn't exist at all — the FK constraint alone would let a
  // cross-workspace id through since the row does exist somewhere.
  const [folderOk, linkOk] = await Promise.all([
    folderId
      ? db.query.folders.findFirst({
          where: and(eq(folders.id, folderId), eq(folders.workspaceId, workspaceId)),
        })
      : true,
    recordingLinkId
      ? db.query.recordingLinks.findFirst({
          where: and(
            eq(recordingLinks.id, recordingLinkId),
            eq(recordingLinks.workspaceId, workspaceId),
          ),
        })
      : true,
  ]);
  if (!folderOk || !linkOk) {
    return NextResponse.json(
      { error: "Unknown folderId or recordingLinkId" },
      { status: 400 },
    );
  }

  const id = newId();

  try {
    const insertRewind = db
      .insert(rewinds)
      .values({ ...fields, folderId, recordingLinkId, workspaceId, id })
      .returning();
    const [rows] = (await db.batch([
      insertRewind,
      ...Array.from(
        { length: Math.ceil(rewindEvents.length / EVENTS_PER_INSERT) },
        (_, i) =>
          db
            .insert(events)
            .values(
              rewindEvents
                .slice(i * EVENTS_PER_INSERT, (i + 1) * EVENTS_PER_INSERT)
                .map((e) => ({ ...e, rewindId: id })),
            ),
      ),
    ])) as [Awaited<typeof insertRewind>];
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return NextResponse.json(
        { error: "Unknown folderId or recordingLinkId" },
        { status: 400 },
      );
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "mediaKey already used" },
        { status: 409 },
      );
    }
    throw error;
  }
}

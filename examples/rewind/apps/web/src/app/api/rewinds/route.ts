import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createRewind, newId } from "@rewind/schema";
import { events, rewinds } from "@/db/schema";
import { db } from "@/lib/db";
import {
  isForeignKeyViolation,
  isUniqueViolation,
  parseBody,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// 6 bound params per event row; 1,000 rows keeps each statement under
// SQLite's 32,766-variable limit. All chunks share one db.batch, so the
// rewind and its events still commit atomically.
const EVENTS_PER_INSERT = 1_000;

export async function GET() {
  const rows = await db.query.rewinds.findMany({
    orderBy: desc(rewinds.createdAt),
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, createRewind);
  if (parsed instanceof NextResponse) return parsed;

  const { events: rewindEvents, ...fields } = parsed;
  const id = newId();

  try {
    const insertRewind = db
      .insert(rewinds)
      .values({ ...fields, id })
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

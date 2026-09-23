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
      ...(rewindEvents.length
        ? [
            db
              .insert(events)
              .values(rewindEvents.map((e) => ({ ...e, rewindId: id }))),
          ]
        : []),
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

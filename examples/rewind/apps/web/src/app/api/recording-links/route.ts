import { NextResponse } from "next/server";
import { createRecordingLink } from "@rewind/schema";
import { recordingLinks } from "@/db/schema";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.query.recordingLinks.findMany();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, createRecordingLink);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db.insert(recordingLinks).values(parsed).returning();
  return NextResponse.json(row, { status: 201 });
}

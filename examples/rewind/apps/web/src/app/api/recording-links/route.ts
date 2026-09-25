import { NextResponse } from "next/server";
import { createRecordingLink } from "@rewind/schema";
import { recordingLinks } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";
import { listRecordingLinks } from "@/lib/rewinds";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const rows = await listRecordingLinks(session.workspace.id);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, createRecordingLink);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db
    .insert(recordingLinks)
    .values({ ...parsed, workspaceId: session.workspace.id })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

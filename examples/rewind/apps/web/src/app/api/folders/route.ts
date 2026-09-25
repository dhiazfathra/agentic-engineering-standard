import { NextResponse } from "next/server";
import { createFolder } from "@rewind/schema";
import { folders } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";
import { listFolders } from "@/lib/rewinds";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const rows = await listFolders(session.workspace.id);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, createFolder);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db
    .insert(folders)
    .values({ ...parsed, workspaceId: session.workspace.id })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

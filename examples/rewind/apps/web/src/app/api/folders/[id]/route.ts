import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { updateFolder } from "@rewind/schema";
import { folders } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const parsed = await parseBody(req, updateFolder);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db
    .update(folders)
    .set(parsed)
    .where(and(eq(folders.id, id), eq(folders.workspaceId, session.workspace.id)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const [row] = await db
    .delete(folders)
    .where(and(eq(folders.id, id), eq(folders.workspaceId, session.workspace.id)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ id });
}

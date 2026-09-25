import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createComment } from "@rewind/schema";
import { comments, rewinds } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isForeignKeyViolation, parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const parsed = await parseBody(req, createComment);
  if (parsed instanceof NextResponse) return parsed;

  const rewind = await db.query.rewinds.findFirst({
    where: and(eq(rewinds.id, id), eq(rewinds.workspaceId, session.workspace.id)),
  });
  if (!rewind) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const [row] = await db
      .insert(comments)
      .values({ ...parsed, rewindId: id })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

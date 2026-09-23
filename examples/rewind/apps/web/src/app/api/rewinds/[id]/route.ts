import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { updateRewind } from "@rewind/schema";
import { comments, events, rewinds } from "@/db/schema";
import { db } from "@/lib/db";
import { isForeignKeyViolation, parseBody } from "@/lib/http";
import { env } from "@/lib/env";
import { s3 } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const row = await db.query.rewinds.findFirst({
    where: eq(rewinds.id, id),
    with: {
      events: { orderBy: asc(events.t) },
      comments: { orderBy: asc(comments.t) },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, updateRewind);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const [row] = await db
      .update(rewinds)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(rewinds.id, id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return NextResponse.json({ error: "Unknown folderId" }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const [row] = await db.delete(rewinds).where(eq(rewinds.id, id)).returning();
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: row.mediaKey }),
    );
  } catch (error) {
    console.error("Failed to delete blob for rewind", id, error);
  }
  return NextResponse.json({ id });
}

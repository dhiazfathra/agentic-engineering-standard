import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { updateRewind } from "@rewind/schema";
import { rewinds, workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import { getSession, notFound } from "@/lib/auth";
import { isForeignKeyViolation, parseBody } from "@/lib/http";
import { env } from "@/lib/env";
import { getRewind } from "@/lib/rewinds";
import { s3 } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const row = await getRewind(id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getSession(req);
  if (session?.workspace.id !== row.workspaceId) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, row.workspaceId),
    });
    if (workspace?.defaultLinkAccess !== "anyone") {
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      // Cross-workspace: hide that the row exists.
      return notFound();
    }
  }
  return NextResponse.json(row);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = await parseBody(req, updateRewind);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const [row] = await db
      .update(rewinds)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(eq(rewinds.id, id), eq(rewinds.workspaceId, session.workspace.id)),
      )
      .returning();
    if (!row) {
      return notFound();
    }
    return NextResponse.json(row);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return NextResponse.json({ error: "Unknown folderId" }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [row] = await db
    .delete(rewinds)
    .where(
      and(eq(rewinds.id, id), eq(rewinds.workspaceId, session.workspace.id)),
    )
    .returning();
  if (!row) {
    return notFound();
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

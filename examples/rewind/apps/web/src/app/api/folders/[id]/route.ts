import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { updateFolder } from "@rewind/schema";
import { folders } from "@/db/schema";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, updateFolder);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db
    .update(folders)
    .set(parsed)
    .where(eq(folders.id, id))
    .returning();
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const [row] = await db.delete(folders).where(eq(folders.id, id)).returning();
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ id });
}

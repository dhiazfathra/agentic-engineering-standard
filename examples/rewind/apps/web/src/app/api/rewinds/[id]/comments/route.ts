import { NextResponse } from "next/server";
import { createComment } from "@rewind/schema";
import { comments } from "@/db/schema";
import { db } from "@/lib/db";
import { isForeignKeyViolation, parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, createComment);
  if (parsed instanceof NextResponse) return parsed;

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

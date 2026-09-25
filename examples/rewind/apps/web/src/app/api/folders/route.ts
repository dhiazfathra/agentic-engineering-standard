import { NextResponse } from "next/server";
import { createFolder } from "@rewind/schema";
import { folders } from "@/db/schema";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/http";
import { listFolders } from "@/lib/rewinds";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listFolders();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, createFolder);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db.insert(folders).values(parsed).returning();
  return NextResponse.json(row, { status: 201 });
}

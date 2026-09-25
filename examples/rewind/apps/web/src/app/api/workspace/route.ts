import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { updateWorkspace } from "@rewind/schema";
import { workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import { requireAdmin, requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  return NextResponse.json(session.workspace);
}

export async function PATCH(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const forbidden = requireAdmin(session);
  if (forbidden) return forbidden;

  const parsed = await parseBody(req, updateWorkspace);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db
    .update(workspaces)
    .set(parsed)
    .where(eq(workspaces.id, session.workspace.id))
    .returning();
  return NextResponse.json(row);
}

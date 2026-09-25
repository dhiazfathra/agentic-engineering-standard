import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import { generateInviteCode, requireAdmin, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const forbidden = requireAdmin(session);
  if (forbidden) return forbidden;

  const [row] = await db
    .update(workspaces)
    .set({ inviteCode: generateInviteCode() })
    .where(eq(workspaces.id, session.workspace.id))
    .returning();
  return NextResponse.json(row);
}

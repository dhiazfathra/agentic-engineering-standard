import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createWorkspace } from "@rewind/schema";
import { memberships, workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import {
  createSession,
  generateInviteCode,
  requireSession,
  setSessionCookie,
} from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const rows = await db.query.memberships.findMany({
    where: eq(memberships.userId, session.user.id),
    with: { workspace: true },
  });
  return NextResponse.json(rows.map((row) => row.workspace));
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, createWorkspace);
  if (parsed instanceof NextResponse) return parsed;

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: parsed.name, inviteCode: generateInviteCode() })
    .returning();
  await db
    .insert(memberships)
    .values({ workspaceId: workspace.id, userId: session.user.id, role: "Admin" });

  const token = await createSession(session.user.id, workspace.id);
  const res = NextResponse.json(workspace, { status: 201 });
  setSessionCookie(res, token);
  return res;
}

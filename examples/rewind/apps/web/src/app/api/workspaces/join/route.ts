import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { joinWorkspace } from "@rewind/schema";
import { memberships, workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import { createSession, requireSession, setSessionCookie } from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

const INVALID = NextResponse.json(
  { error: "That invite link isn't valid" },
  { status: 400 },
);

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, joinWorkspace);
  if (parsed instanceof NextResponse) return parsed;

  const code =
    parsed.code ?? parsed.inviteUrl?.split("/").filter(Boolean).pop();
  if (!code) {
    return INVALID;
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.inviteCode, code),
  });
  if (!workspace || !workspace.inviteLinkEnabled) {
    return INVALID;
  }

  const existing = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.workspaceId, workspace.id),
      eq(memberships.userId, session.user.id),
    ),
  });
  if (!existing) {
    await db
      .insert(memberships)
      .values({ workspaceId: workspace.id, userId: session.user.id, role: "Viewer" });
  }

  const token = await createSession(session.user.id, workspace.id);
  const res = NextResponse.json(workspace);
  setSessionCookie(res, token);
  return res;
}

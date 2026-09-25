import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { switchWorkspace } from "@rewind/schema";
import { memberships, workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import { createSession, requireSession, setSessionCookie } from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, switchWorkspace);
  if (parsed instanceof NextResponse) return parsed;

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.workspaceId, parsed.id),
      eq(memberships.userId, session.user.id),
    ),
  });
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, parsed.id),
  });
  const token = await createSession(session.user.id, parsed.id);
  const res = NextResponse.json(workspace);
  setSessionCookie(res, token);
  return res;
}

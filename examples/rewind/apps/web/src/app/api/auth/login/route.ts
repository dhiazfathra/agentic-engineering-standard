import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { loginRequest } from "@rewind/schema";
import { memberships, users, workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import {
  createSession,
  publicUser,
  setEmailCookie,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseBody(req, loginRequest);
  if (parsed instanceof NextResponse) return parsed;

  const email = parsed.email.toLowerCase();
  const invalid = () =>
    NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !verifyPassword(parsed.password, user.passwordHash)) {
    return invalid();
  }

  const membership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, user.id),
    orderBy: desc(memberships.lastActiveAt),
  });
  if (!membership) return invalid();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, membership.workspaceId),
  });
  if (!workspace) return invalid();

  const token = await createSession(user.id, workspace.id);
  const res = NextResponse.json({ user: publicUser(user), workspace });
  setSessionCookie(res, token);
  setEmailCookie(res, email);
  return res;
}

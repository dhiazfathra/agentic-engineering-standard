import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { updateMe } from "@rewind/schema";
import { memberships, users, workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import { clearSessionCookie, publicUser, requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  return NextResponse.json(publicUser(session.user));
}

export async function PATCH(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, updateMe);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db
    .update(users)
    .set(parsed)
    .where(eq(users.id, session.user.id))
    .returning();
  return NextResponse.json(publicUser(row));
}

export async function DELETE(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  await db.delete(users).where(eq(users.id, session.user.id));

  const remaining = await db.query.memberships.findFirst({
    where: eq(memberships.workspaceId, session.workspace.id),
  });
  if (!remaining) {
    await db.delete(workspaces).where(eq(workspaces.id, session.workspace.id));
  }

  const res = NextResponse.json({ id: session.user.id });
  clearSessionCookie(res);
  return res;
}

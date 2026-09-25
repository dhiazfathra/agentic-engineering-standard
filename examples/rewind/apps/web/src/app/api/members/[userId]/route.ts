import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { updateMember } from "@rewind/schema";
import { memberships } from "@/db/schema";
import { db } from "@/lib/db";
import { requireAdmin, requireSession, type Session } from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

const LAST_ADMIN = NextResponse.json(
  { error: "The last Admin cannot be removed or demoted" },
  { status: 409 },
);

/** True when `userId` is the workspace's only Admin. */
async function isLastAdmin(
  session: Session,
  userId: string,
): Promise<boolean> {
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.workspaceId, session.workspace.id),
      eq(memberships.userId, userId),
    ),
  });
  if (!membership || membership.role !== "Admin") return false;

  const otherAdmins = await db.query.memberships.findMany({
    where: and(
      eq(memberships.workspaceId, session.workspace.id),
      eq(memberships.role, "Admin"),
      ne(memberships.userId, userId),
    ),
  });
  return otherAdmins.length === 0;
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const forbidden = requireAdmin(session);
  if (forbidden) return forbidden;

  const { userId } = await params;
  const parsed = await parseBody(req, updateMember);
  if (parsed instanceof NextResponse) return parsed;

  if (parsed.role !== "Admin" && (await isLastAdmin(session, userId))) {
    return LAST_ADMIN;
  }

  const [row] = await db
    .update(memberships)
    .set({ role: parsed.role })
    .where(
      and(
        eq(memberships.workspaceId, session.workspace.id),
        eq(memberships.userId, userId),
      ),
    )
    .returning();
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const forbidden = requireAdmin(session);
  if (forbidden) return forbidden;

  const { userId } = await params;
  if (await isLastAdmin(session, userId)) return LAST_ADMIN;

  const [row] = await db
    .delete(memberships)
    .where(
      and(
        eq(memberships.workspaceId, session.workspace.id),
        eq(memberships.userId, userId),
      ),
    )
    .returning();
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ userId });
}

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { memberships } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const rows = await db.query.memberships.findMany({
    where: eq(memberships.workspaceId, session.workspace.id),
    with: { user: true },
  });
  return NextResponse.json(
    rows.map(({ user, role, lastActiveAt }) => ({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role,
      lastActiveAt,
    })),
  );
}

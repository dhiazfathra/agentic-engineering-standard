import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createInvites } from "@rewind/schema";
import { invites } from "@/db/schema";
import { db } from "@/lib/db";
import { forbidden, requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

// Any member can see whether the workspace has invited anyone (the "Get
// started" checklist needs this); only Admins (when restrictInvites is on)
// can send a new one, enforced in POST below.
export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const rows = await db.query.invites.findMany({
    where: eq(invites.workspaceId, session.workspace.id),
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  if (session.workspace.restrictInvites && session.membership.role !== "Admin") {
    return forbidden();
  }

  const parsed = await parseBody(req, createInvites);
  if (parsed instanceof NextResponse) return parsed;

  const rows = await db
    .insert(invites)
    .values(
      parsed.emails.map((email) => ({
        workspaceId: session.workspace.id,
        email,
        role: parsed.role,
      })),
    )
    .returning();
  return NextResponse.json(rows, { status: 201 });
}

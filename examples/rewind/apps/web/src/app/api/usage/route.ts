import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { memberships, recordingLinks, rewinds } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Free plan limits from the design.
const REWINDS_LIMIT = 30;
const RECORDING_LINKS_LIMIT = 5;
const MEMBERS_LIMIT = 20;

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const workspaceId = session.workspace.id;
  const [[rewindsRow], [linksRow], [membersRow]] = await Promise.all([
    db.select({ value: count() }).from(rewinds).where(eq(rewinds.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(recordingLinks)
      .where(eq(recordingLinks.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(memberships)
      .where(eq(memberships.workspaceId, workspaceId)),
  ]);

  return NextResponse.json({
    rewinds: { used: rewindsRow.value, limit: REWINDS_LIMIT },
    recordingLinks: { used: linksRow.value, limit: RECORDING_LINKS_LIMIT },
    members: { used: membersRow.value, limit: MEMBERS_LIMIT },
  });
}

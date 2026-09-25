import { count, eq } from "drizzle-orm";
import { memberships, recordingLinks, rewinds } from "@/db/schema";
import { db } from "@/lib/db";

// Free plan limits from the design.
export const REWINDS_LIMIT = 30;
export const RECORDING_LINKS_LIMIT = 5;
export const MEMBERS_LIMIT = 20;

export type Usage = {
  rewinds: { used: number; limit: number };
  recordingLinks: { used: number; limit: number };
  members: { used: number; limit: number };
};

/** Workspace's Free-plan usage, shared by `GET /api/usage` and Settings › Billing. */
export async function getUsage(workspaceId: string): Promise<Usage> {
  const [[rewindsRow], [linksRow], [membersRow]] = await Promise.all([
    db
      .select({ value: count() })
      .from(rewinds)
      .where(eq(rewinds.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(recordingLinks)
      .where(eq(recordingLinks.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(memberships)
      .where(eq(memberships.workspaceId, workspaceId)),
  ]);

  return {
    rewinds: { used: rewindsRow.value, limit: REWINDS_LIMIT },
    recordingLinks: { used: linksRow.value, limit: RECORDING_LINKS_LIMIT },
    members: { used: membersRow.value, limit: MEMBERS_LIMIT },
  };
}

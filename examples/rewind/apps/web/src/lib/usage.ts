import { and, count, eq, isNotNull } from "drizzle-orm";
import { memberships, recordingLinks, rewinds } from "@/db/schema";
import { db } from "@/lib/db";

// Free plan limits from the design.
export const REWINDS_LIMIT = 30;
export const RECORDING_LINKS_LIMIT = 5;
export const MEMBERS_LIMIT = 20;
// No stated Free-tier cap for AI summaries in the design (only the Team
// plan's marketing copy mentions "200 AI summaries"); this row is display
// only (AI_SUMMARY-gated, see settings.tsx), so it reuses the Rewinds cap.
export const AI_SUMMARIES_LIMIT = REWINDS_LIMIT;

export type Usage = {
  rewinds: { used: number; limit: number };
  recordingLinks: { used: number; limit: number };
  members: { used: number; limit: number };
  aiSummaries: { used: number; limit: number };
};

/** Workspace's Free-plan usage, shared by `GET /api/usage` and Settings › Billing. */
export async function getUsage(workspaceId: string): Promise<Usage> {
  const [[rewindsRow], [linksRow], [membersRow], [aiRow]] = await Promise.all([
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
    db
      .select({ value: count() })
      .from(rewinds)
      .where(
        and(
          eq(rewinds.workspaceId, workspaceId),
          isNotNull(rewinds.errorSignature),
        ),
      ),
  ]);

  return {
    rewinds: { used: rewindsRow.value, limit: REWINDS_LIMIT },
    recordingLinks: { used: linksRow.value, limit: RECORDING_LINKS_LIMIT },
    members: { used: membersRow.value, limit: MEMBERS_LIMIT },
    aiSummaries: { used: aiRow.value, limit: AI_SUMMARIES_LIMIT },
  };
}

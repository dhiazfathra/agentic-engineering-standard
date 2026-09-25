import { eq } from "drizzle-orm";
import { memberships } from "@/db/schema";
import { db } from "@/lib/db";

export type MemberListItem = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  lastActiveAt: Date;
};

/** Every member of `workspaceId`, shared by `GET /api/members` and Settings › Members. */
export async function listMembers(
  workspaceId: string,
): Promise<MemberListItem[]> {
  const rows = await db.query.memberships.findMany({
    where: eq(memberships.workspaceId, workspaceId),
    with: { user: true },
  });
  return rows.map(({ user, role, lastActiveAt }) => ({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role,
    lastActiveAt,
  }));
}

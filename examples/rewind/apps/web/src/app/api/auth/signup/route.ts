import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { signupRequest } from "@rewind/schema";
import { invites, memberships, users, workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import {
  createSession,
  generateInviteCode,
  hashPassword,
  publicUser,
  setSessionCookie,
} from "@/lib/auth";
import { isUniqueViolation, parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseBody(req, signupRequest);
  if (parsed instanceof NextResponse) return parsed;

  const email = parsed.email.toLowerCase();
  const passwordHash = hashPassword(parsed.password);

  try {
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
      })
      .returning();

    // A pending invite for this email joins that workspace instead of
    // creating a new one.
    const invite = await db.query.invites.findFirst({
      where: eq(invites.email, email),
    });

    let workspace;
    if (invite) {
      workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, invite.workspaceId),
      });
    }

    if (workspace && invite) {
      await db.batch([
        db.insert(memberships).values({
          workspaceId: workspace.id,
          userId: user.id,
          role: invite.role,
        }),
        db
          .delete(invites)
          .where(
            and(eq(invites.workspaceId, workspace.id), eq(invites.email, email)),
          ),
      ]);
    } else {
      [workspace] = await db
        .insert(workspaces)
        .values({
          name: `${parsed.firstName}'s Workspace`,
          inviteCode: generateInviteCode(),
        })
        .returning();
      await db
        .insert(memberships)
        .values({ workspaceId: workspace.id, userId: user.id, role: "Admin" });
    }

    const token = await createSession(user.id, workspace.id);
    const res = NextResponse.json(
      { user: publicUser(user), workspace },
      { status: 201 },
    );
    setSessionCookie(res, token);
    return res;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 },
      );
    }
    throw error;
  }
}

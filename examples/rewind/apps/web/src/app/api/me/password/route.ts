import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { changePasswordRequest } from "@rewind/schema";
import { sessions, users } from "@/db/schema";
import { db } from "@/lib/db";
import {
  forbidden,
  hashPassword,
  hashToken,
  readCookie,
  requireSession,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Change the caller's password; ends the user's other sessions. */
export async function PATCH(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const limited = await rateLimit([
    { key: `password:user:${session.user.id}`, limit: 5 },
  ]);
  if (limited) return limited;

  const parsed = await parseBody(req, changePasswordRequest);
  if (parsed instanceof NextResponse) return parsed;

  if (!verifyPassword(parsed.currentPassword, session.user.passwordHash)) {
    return forbidden();
  }

  await db
    .update(users)
    .set({ passwordHash: hashPassword(parsed.newPassword) })
    .where(eq(users.id, session.user.id));
  // requireSession succeeded via the cookie, so it is present here.
  const current = hashToken(readCookie(req, SESSION_COOKIE)!);
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, session.user.id), ne(sessions.id, current)));
  return new NextResponse(null, { status: 204 });
}

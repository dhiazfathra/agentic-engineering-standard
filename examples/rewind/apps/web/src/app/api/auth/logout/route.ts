import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sessions } from "@/db/schema";
import { db } from "@/lib/db";
import { clearSessionCookie, hashToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const header = req.headers.get("cookie");
  const token = header
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }

  const res = NextResponse.json({});
  clearSessionCookie(res);
  return res;
}

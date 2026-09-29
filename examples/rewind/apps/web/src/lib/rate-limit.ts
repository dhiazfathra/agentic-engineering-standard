import "server-only";
import { lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { rateLimits } from "@/db/schema";
import { db } from "@/lib/db";

export const WINDOW_MS = 15 * 60 * 1000;

export type Rule = { key: string; limit: number };

/** Client IP: first entry of `x-forwarded-for`, else "unknown". */
export function clientIp(req: Request): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Counts one hit against every rule in a DB-backed fixed window (shared by
 * all serverless instances, unlike in-memory). Returns a 429 with
 * `Retry-After` for the first rule over its limit, else null.
 */
export async function rateLimit(
  rules: Rule[],
  now = Date.now(),
): Promise<NextResponse | null> {
  // ponytail: one prune per call; move to a cron if the table gets hot.
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, now - WINDOW_MS));
  for (const { key, limit } of rules) {
    const expired = sql`${rateLimits.windowStart} <= ${now - WINDOW_MS}`;
    const [row] = await db
      .insert(rateLimits)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
          windowStart: sql`case when ${expired} then ${now} else ${rateLimits.windowStart} end`,
        },
      })
      .returning();
    if (row.count > limit) {
      const retryAfter = Math.ceil((row.windowStart + WINDOW_MS - now) / 1000);
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }
  return null;
}

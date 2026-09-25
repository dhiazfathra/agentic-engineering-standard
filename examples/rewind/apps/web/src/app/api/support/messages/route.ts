import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createSupportMessage } from "@rewind/schema";
import { supportMessages } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";
import { flags } from "@/lib/flags";

export const dynamic = "force-dynamic";

/**
 * `SUPPORT_WIDGET`-flagged chat: SPEC-design-parity.md says "No support
 * inbox or status source. Chat messages are stored, reply is canned."
 */
export async function GET(req: Request) {
  if (!flags.SUPPORT_WIDGET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const rows = await db.query.supportMessages.findMany({
    where: eq(supportMessages.userId, session.user.id),
  });
  return NextResponse.json(
    rows.map(({ id, text, createdAt }) => ({ id, text, createdAt })),
  );
}

const CANNED_REPLY =
  "Thanks for the message — a real person on the Rewind team will follow up soon.";

export async function POST(req: Request) {
  if (!flags.SUPPORT_WIDGET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, createSupportMessage);
  if (parsed instanceof NextResponse) return parsed;

  const [row] = await db
    .insert(supportMessages)
    .values({ userId: session.user.id, text: parsed.text })
    .returning();
  return NextResponse.json(
    {
      id: row.id,
      text: row.text,
      createdAt: row.createdAt,
      reply: CANNED_REPLY,
    },
    { status: 201 },
  );
}

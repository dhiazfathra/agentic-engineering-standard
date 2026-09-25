import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createToken } from "@rewind/schema";
import { accessTokens } from "@/db/schema";
import { db } from "@/lib/db";
import { generateToken, hashToken, requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const rows = await db.query.accessTokens.findMany({
    where: eq(accessTokens.userId, session.user.id),
  });
  return NextResponse.json(
    rows.map(({ id, name, createdAt, expiresAt }) => ({
      id,
      name,
      createdAt,
      expiresAt,
    })),
  );
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, createToken);
  if (parsed instanceof NextResponse) return parsed;

  const token = generateToken();
  const [row] = await db
    .insert(accessTokens)
    .values({
      userId: session.user.id,
      name: parsed.name,
      tokenHash: hashToken(token),
    })
    .returning();
  return NextResponse.json(
    { id: row.id, name: row.name, createdAt: row.createdAt, token },
    { status: 201 },
  );
}

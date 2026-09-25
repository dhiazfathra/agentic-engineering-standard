import { NextResponse } from "next/server";
import { getUsage } from "@/lib/usage";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  return NextResponse.json(await getUsage(session.workspace.id));
}

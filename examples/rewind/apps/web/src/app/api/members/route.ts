import { NextResponse } from "next/server";
import { listMembers } from "@/lib/members";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const rows = await listMembers(session.workspace.id);
  return NextResponse.json(rows);
}

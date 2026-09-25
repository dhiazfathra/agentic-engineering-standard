import { NextResponse } from "next/server";
import { flags } from "@/lib/flags";
import { requireSession } from "@/lib/auth";
import { listIntegrations } from "@/lib/integrations";

export const dynamic = "force-dynamic";

/** Connected integration names for the session's workspace. `INTEGRATIONS`-flagged. */
export async function GET(req: Request) {
  if (!flags.INTEGRATIONS) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const names = await listIntegrations(session.workspace.id);
  return NextResponse.json(names);
}

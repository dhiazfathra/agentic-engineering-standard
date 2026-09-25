import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { integrations } from "@/db/schema";
import { db } from "@/lib/db";
import { requireAdmin, requireSession } from "@/lib/auth";
import { flags } from "@/lib/flags";
import { INTEGRATION_IDS } from "@/lib/integrations";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ name: string }> };

/**
 * Connect/disconnect a catalog integration for the session's workspace.
 * `INTEGRATIONS`-flagged: SPEC-design-parity.md says "No OAuth with Linear,
 * Jira, GitHub or the rest. Connect state is stored, nothing sent."
 */
export async function POST(req: Request, { params }: Params) {
  if (!flags.INTEGRATIONS) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const forbidden = requireAdmin(session);
  if (forbidden) return forbidden;

  const { name } = await params;
  if (!INTEGRATION_IDS.has(name)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .insert(integrations)
    .values({ workspaceId: session.workspace.id, name })
    .onConflictDoNothing({
      target: [integrations.workspaceId, integrations.name],
    });
  return NextResponse.json({ name, connected: true });
}

export async function DELETE(req: Request, { params }: Params) {
  if (!flags.INTEGRATIONS) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const forbidden = requireAdmin(session);
  if (forbidden) return forbidden;

  const { name } = await params;
  await db
    .delete(integrations)
    .where(
      and(
        eq(integrations.workspaceId, session.workspace.id),
        eq(integrations.name, name),
      ),
    );
  return NextResponse.json({ name, connected: false });
}

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createRecRewind, newId } from "@rewind/schema";
import { recordingLinks, rewinds } from "@/db/schema";
import { db } from "@/lib/db";
import { notFound } from "@/lib/auth";
import { isUniqueViolation, parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Public: files a Rewind from a `/rec/[id]` recording. No session — the
 * link id itself is the capability. reporterName has no real identity to
 * carry, so it names the source instead of a person.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const link = await db.query.recordingLinks.findFirst({
    where: eq(recordingLinks.id, id),
  });
  if (!link) return notFound();

  const parsed = await parseBody(req, createRecRewind);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const [row] = await db
      .insert(rewinds)
      .values({
        id: newId(),
        title: `Recording from ${link.name}`,
        url: new URL(req.url).origin + `/rec/${id}`,
        reporterName: "Recording link",
        kind: "video",
        mediaKey: parsed.mediaKey,
        durationSeconds: parsed.durationSeconds,
        recordingLinkId: link.id,
        workspaceId: link.workspaceId,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "mediaKey already used" },
        { status: 409 },
      );
    }
    throw error;
  }
}

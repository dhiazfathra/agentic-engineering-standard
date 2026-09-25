import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { recordingLinks } from "@/db/schema";
import { db } from "@/lib/db";
import { Recorder } from "./recorder";

// A recording link's existence can change (none do today, but nothing rules
// it out), so the page always reads the current row.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function RecPage({ params }: Props) {
  const { id } = await params;
  const link = await db.query.recordingLinks.findFirst({
    where: eq(recordingLinks.id, id),
  });
  if (!link) notFound();

  return <Recorder linkId={link.id} linkName={link.name} />;
}

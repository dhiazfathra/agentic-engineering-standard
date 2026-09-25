import { eq } from "drizzle-orm";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { workspaces } from "@/db/schema";
import { db } from "@/lib/db";
import { getPageSession } from "@/lib/auth";
import {
  getRewind as getRewindUncached,
  listSimilarRewinds,
} from "@/lib/rewinds";
import { mediaUrl } from "@/lib/storage";
import { Viewer } from "./viewer";

// De-duped per request: generateMetadata and the page both need the row,
// and React's cache() collapses them into a single query.
const getRewind = cache(getRewindUncached);

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const rewind = await getRewind(id);
  return { title: rewind?.title ?? "Rewind" };
}

export default async function RewindPage({ params }: Props) {
  const { id } = await params;
  const rewind = await getRewind(id);
  if (!rewind) notFound();

  const session = await getPageSession();
  if (session?.workspace.id !== rewind.workspaceId) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, rewind.workspaceId),
    });
    if (!workspace || workspace.defaultLinkAccess !== "anyone") {
      if (!session) redirect("/login");
      notFound();
    }
  }

  const similarRewinds = rewind.errorSignature
    ? await listSimilarRewinds(rewind.workspaceId, rewind.errorSignature, rewind.id)
    : [];

  return (
    <Viewer
      rewind={rewind}
      mediaUrl={await mediaUrl(rewind.mediaKey)}
      similarRewinds={similarRewinds}
    />
  );
}

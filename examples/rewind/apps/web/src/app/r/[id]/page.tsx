import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRewind } from "@/lib/rewinds";
import { mediaUrl } from "@/lib/storage";
import { Viewer } from "./viewer";

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
  return <Viewer rewind={rewind} mediaUrl={await mediaUrl(rewind.mediaKey)} />;
}

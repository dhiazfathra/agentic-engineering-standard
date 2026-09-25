import { redirect } from "next/navigation";
import { LinksPage } from "./links";
import { getPageSession } from "@/lib/auth";
import { listRecordingLinks } from "@/lib/rewinds";

// Recording links and their counts can change between requests (a new
// link, a new recording), so the page always reads the current rows.
export const dynamic = "force-dynamic";

export default async function Links() {
  const session = await getPageSession();
  if (!session) redirect("/login");

  const links = await listRecordingLinks(session.workspace.id);
  return <LinksPage links={links} userId={session.user.id} />;
}

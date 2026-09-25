import { redirect } from "next/navigation";
import { Library } from "./library";
import { getPageSession } from "@/lib/auth";
import { parseLibraryParams } from "@/lib/library";
import { listFolders, listRewinds } from "@/lib/rewinds";

// Rewinds and folders can change between requests (rename, delete, drag and
// drop), so the library always reads the current rows.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: Props) {
  const session = await getPageSession();
  if (!session) redirect("/login");

  const { view, folder } = parseLibraryParams(await searchParams);
  const [rewinds, folders] = await Promise.all([
    listRewinds(session.workspace.id),
    listFolders(session.workspace.id),
  ]);
  return (
    <Library
      rewinds={rewinds}
      folders={folders}
      view={view}
      folderId={folder}
      groupDuplicates={session.workspace.groupDuplicates}
      workspace={{ id: session.workspace.id, name: session.workspace.name }}
      userName={`${session.user.firstName} ${session.user.lastName}`}
    />
  );
}

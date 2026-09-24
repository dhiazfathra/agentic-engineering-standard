import { Library } from "./library";
import { parseLibraryParams } from "@/lib/library";
import { listFolders, listRewinds } from "@/lib/rewinds";

// Rewinds and folders can change between requests (rename, delete, drag and
// drop), so the library always reads the current rows.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: Props) {
  const { view, folder } = parseLibraryParams(await searchParams);
  const [rewinds, folders] = await Promise.all([listRewinds(), listFolders()]);
  return (
    <Library
      rewinds={rewinds}
      folders={folders}
      view={view}
      folderId={folder}
    />
  );
}

import type { RewindStatus } from "@rewind/schema";
import type { FolderListItem, RewindListItem } from "@/lib/rewinds";
import { STATUS_LABEL } from "@/lib/viewer";

export type LibraryView = "grid" | "list" | "board";

const VIEWS: LibraryView[] = ["grid", "list", "board"];

export type LibraryParams = { view: LibraryView; folder?: string };

/** `?view=` defaults to `grid` on anything unknown; `?folder=` is optional. */
export function parseLibraryParams(
  searchParams: Record<string, string | string[] | undefined>,
): LibraryParams {
  const rawView = searchParams.view;
  const view = VIEWS.includes(rawView as LibraryView)
    ? (rawView as LibraryView)
    : "grid";
  const folder =
    typeof searchParams.folder === "string" ? searchParams.folder : undefined;
  return folder === undefined ? { view } : { view, folder };
}

/** All Rewinds when `folderId` is undefined; only that folder's otherwise. */
export function filterByFolder<T extends { folderId: string | null }>(
  rewinds: T[],
  folderId: string | undefined,
): T[] {
  return folderId === undefined
    ? rewinds
    : rewinds.filter((r) => r.folderId === folderId);
}

/** Each folder id to its Rewind count, for the sidebar. */
export function folderCounts<T extends { folderId: string | null }>(
  rewinds: T[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rewinds) {
    if (r.folderId === null) continue;
    counts[r.folderId] = (counts[r.folderId] ?? 0) + 1;
  }
  return counts;
}

export type Stacked<T> = T & { stackCount: number };

/**
 * Grid-only grouping. Keeps the first (newest, per `listRewinds`'s
 * newest-first order) Rewind for each `errorSignature`, tagging it with
 * how many share that signature. A null/undefined signature never groups
 * with anything, including another null one. Pass `enabled: false` to get
 * every Rewind back unchanged with `stackCount: 1`.
 */
export function groupDuplicates<
  T extends { errorSignature: string | null | undefined },
>(rewinds: T[], enabled: boolean): Stacked<T>[] {
  if (!enabled) return rewinds.map((r) => ({ ...r, stackCount: 1 }));
  const bySignature = new Map<string, Stacked<T>>();
  const result: Stacked<T>[] = [];
  for (const r of rewinds) {
    const sig = r.errorSignature;
    const existing = sig != null ? bySignature.get(sig) : undefined;
    if (existing) {
      existing.stackCount += 1;
      continue;
    }
    const stacked: Stacked<T> = { ...r, stackCount: 1 };
    if (sig != null) bySignature.set(sig, stacked);
    result.push(stacked);
  }
  return result;
}

export type BoardColumn<T> = {
  status: RewindStatus;
  label: string;
  rewinds: T[];
};

/** The four `STATUS_LABEL` columns, each with its Rewinds in list order. */
export function boardColumns<T extends { status: RewindStatus }>(
  rewinds: T[],
): BoardColumn<T>[] {
  return (Object.keys(STATUS_LABEL) as RewindStatus[]).map((status) => ({
    status,
    label: STATUS_LABEL[status],
    rewinds: rewinds.filter((r) => r.status === status),
  }));
}

/** "Untitled folder N", one past the highest N already used. */
export function nextFolderName(folders: { name: string }[]): string {
  const pattern = /^Untitled folder (\d+)$/;
  const used = folders
    .map((f) => Number(pattern.exec(f.name)?.[1]))
    .filter((n) => !Number.isNaN(n));
  return `Untitled folder ${used.length > 0 ? Math.max(...used) + 1 : 1}`;
}

export type PaletteItem =
  | { kind: "all"; label: string }
  | { kind: "folder"; id: string; label: string }
  | { kind: "view"; id: LibraryView; label: string }
  | { kind: "theme"; dark: boolean; label: string }
  | { kind: "rewind"; id: string; label: string }
  | { kind: "command"; id: string; label: string };

const VIEW_LABEL: Record<LibraryView, string> = {
  grid: "Switch to grid view",
  list: "Switch to list view",
  board: "Switch to board view",
};

/** A shell action the palette can jump to (see `SHELL_COMMANDS` below). */
export type PaletteCommand = { id: string; label: string };

/** Every palette item: All Rewinds, folders, views, theme, commands, then Rewinds. */
export function paletteItems(
  rewinds: { id: string; title: string }[],
  folders: { id: string; name: string }[],
  dark: boolean,
  commands: PaletteCommand[] = [],
): PaletteItem[] {
  return [
    { kind: "all", label: "Go to All Rewinds" },
    ...folders.map((f): PaletteItem => ({
      kind: "folder",
      id: f.id,
      label: f.name,
    })),
    ...VIEWS.map((view): PaletteItem => ({
      kind: "view",
      id: view,
      label: VIEW_LABEL[view],
    })),
    {
      kind: "theme",
      dark: !dark,
      label: dark ? "Switch to light mode" : "Switch to dark mode",
    },
    ...commands.map((c): PaletteItem => ({
      kind: "command",
      id: c.id,
      label: c.label,
    })),
    ...rewinds.map((r): PaletteItem => ({
      kind: "rewind",
      id: r.id,
      label: r.title,
    })),
  ];
}

/** Case-insensitive substring filter, 9 results at most. */
export function filterPalette(
  items: PaletteItem[],
  query: string,
): PaletteItem[] {
  const q = query.trim().toLowerCase();
  const matches =
    q === "" ? items : items.filter((i) => i.label.toLowerCase().includes(q));
  return matches.slice(0, 9);
}

export type LibraryState = {
  rewinds: RewindListItem[];
  folders: FolderListItem[];
};

export type LibraryAction =
  | { type: "rename"; id: string; title: string }
  | { type: "setStatus"; id: string; status: RewindStatus }
  | { type: "setFolder"; id: string; folderId: string | null }
  | { type: "removeRewind"; id: string }
  | { type: "restoreRewind"; rewind: RewindListItem }
  | { type: "addFolder"; folder: FolderListItem }
  | { type: "renameFolder"; id: string; name: string }
  | { type: "removeFolder"; id: string }
  | { type: "restoreFolder"; folder: FolderListItem; rewindIds: string[] };

/** Every optimistic write the library makes, and its inverse for undo. */
export function libraryReducer(
  state: LibraryState,
  action: LibraryAction,
): LibraryState {
  switch (action.type) {
    case "rename":
      return {
        ...state,
        rewinds: state.rewinds.map((r) =>
          r.id === action.id ? { ...r, title: action.title } : r,
        ),
      };
    case "setStatus":
      return {
        ...state,
        rewinds: state.rewinds.map((r) =>
          r.id === action.id ? { ...r, status: action.status } : r,
        ),
      };
    case "setFolder":
      return {
        ...state,
        rewinds: state.rewinds.map((r) =>
          r.id === action.id ? { ...r, folderId: action.folderId } : r,
        ),
      };
    case "removeRewind":
      return {
        ...state,
        rewinds: state.rewinds.filter((r) => r.id !== action.id),
      };
    case "restoreRewind":
      // Back in its newest-first place, not at the end.
      return {
        ...state,
        rewinds: [...state.rewinds, action.rewind].sort(
          (x, y) => y.createdAt.getTime() - x.createdAt.getTime(),
        ),
      };
    case "addFolder":
      return { ...state, folders: [...state.folders, action.folder] };
    case "renameFolder":
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.id ? { ...f, name: action.name } : f,
        ),
      };
    case "removeFolder":
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.id),
        rewinds: state.rewinds.map((r) =>
          r.folderId === action.id ? { ...r, folderId: null } : r,
        ),
      };
    case "restoreFolder":
      return {
        ...state,
        folders: [...state.folders, action.folder],
        rewinds: state.rewinds.map((r) =>
          action.rewindIds.includes(r.id) && r.folderId === null
            ? { ...r, folderId: action.folder.id }
            : r,
        ),
      };
  }
}

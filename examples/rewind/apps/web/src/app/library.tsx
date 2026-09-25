"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { RewindStatus } from "@rewind/schema";
import { ToastStack, useToast } from "@/components/toast";
import { copyRewindLink } from "@/lib/copy-link";
import { pingExtension } from "@/lib/extension";
import { flags } from "@/lib/flags";
import { getStartedChecks, getStartedProgress } from "@/lib/get-started";
import { usePendingDeletes } from "@/lib/use-pending-deletes";
import {
  boardColumns,
  filterByFolder,
  filterPalette,
  folderCounts,
  groupDuplicates,
  libraryReducer,
  nextFolderName,
  paletteItems,
  type LibraryView,
  type PaletteCommand,
  type PaletteItem,
} from "@/lib/library";
import type { FolderListItem, RewindListItem } from "@/lib/rewinds";
import { setTheme } from "@/lib/theme";
import {
  formatTime,
  initials,
  personColor,
  STATUS_LABEL,
  timeAgo,
} from "@/lib/viewer";
import styles from "./library.module.css";

type Workspace = { id: string; name: string };
type MembershipRole = "Admin" | "Creator" | "Viewer";

type Props = {
  rewinds: RewindListItem[];
  folders: FolderListItem[];
  view: LibraryView;
  folderId?: string;
  groupDuplicates?: boolean;
  // Optional so existing library.test.tsx call sites need no changes;
  // page.tsx always supplies both from the session.
  workspace?: Workspace;
  userName?: string;
};

/** Shell commands the `⌘K` palette can jump to; static, so built once. */
const SHELL_COMMANDS: PaletteCommand[] = [
  { id: "links", label: "Go to Recording links" },
  ...(flags.HELPDESK ? [{ id: "helpdesk", label: "Go to Helpdesk" }] : []),
  { id: "invite", label: "Invite teammates" },
  { id: "workspace", label: "Join or create workspace" },
];

/**
 * `useSyncExternalStore` source for `rw-dark`. `notify` runs after every
 * `setTheme` write (see `toggleDark`), including the one the theme init
 * script's DOM change causes before React ever mounts.
 */
const themeStore = {
  listeners: new Set<() => void>(),
  subscribe(cb: () => void) {
    themeStore.listeners.add(cb);
    return () => themeStore.listeners.delete(cb);
  },
  getSnapshot: () => document.body.classList.contains("rw-dark"),
  notify: () => themeStore.listeners.forEach((cb) => cb()),
};

const VIEWS: { key: LibraryView; label: string }[] = [
  { key: "grid", label: "Grid" },
  { key: "board", label: "Board" },
  { key: "list", label: "List" },
];

/** Board column dot colours, from the design's `COLS`. */
const COLUMN_COLOR: Record<RewindStatus, string> = {
  new: "#3538cd",
  triage: "#a65f00",
  progress: "#e65100",
  done: "#248a3d",
};

function duration(r: RewindListItem): string {
  return r.durationSeconds ? formatTime(r.durationSeconds) : "—";
}

function Avatar({ name }: { name: string }) {
  return (
    <span className={styles.avatar} style={{ background: personColor(name) }}>
      {initials(name)}
    </span>
  );
}

/** Builds `/?view=&folder=`, dropping each param at its default. */
function libraryUrl(view: LibraryView, folderId: string | undefined): string {
  const params = new URLSearchParams();
  if (view !== "grid") params.set("view", view);
  if (folderId !== undefined) params.set("folder", folderId);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

type MenuItem = { label: string; danger?: boolean; onSelect: () => void };
type MenuState = {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  trigger: HTMLElement | null;
};
type Editing = { kind: "rewind" | "folder"; id: string } | null;

const DEFAULT_WORKSPACE: Workspace = { id: "", name: "Workspace" };

export function Library(props: Props) {
  const { view, folderId } = props;
  const workspace = props.workspace ?? DEFAULT_WORKSPACE;
  const userName = props.userName ?? "";
  const router = useRouter();
  const { toasts, showToast, showActionToast, undo, close } = useToast();
  const [{ rewinds, folders }, dispatch] = useReducer(libraryReducer, {
    rewinds: props.rewinds,
    folders: props.folders,
  });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  // Reads `rw-dark` off `<body>` through useSyncExternalStore instead of
  // useState: the theme init script (root layout) applies that class
  // before React hydrates, so a useState initializer reading it directly
  // would return `true` on the client's first render while the server
  // (no DOM) always rendered `false`, a hydration mismatch. The server
  // snapshot below keeps that first render in sync with the server;
  // getSnapshot then picks up the real value once mounted.
  const dark = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    () => false,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(
    undefined,
  );
  const [columnDropTarget, setColumnDropTarget] = useState<
    RewindStatus | undefined
  >(undefined);
  // Set right before navigating away from the folder being deleted, so a
  // stale `folderId` prop (the URL replace lands a tick later) does not
  // flash "Folder not found" in between. Only consulted while that folder
  // is absent, so an Undo that restores it shows its name again.
  const [leavingFolderId, setLeavingFolderId] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(props.groupDuplicates ?? true);

  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [wsSubOpen, setWsSubOpen] = useState(false);
  const [otherWorkspaces, setOtherWorkspaces] = useState<Workspace[]>([]);
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [wsBusy, setWsBusy] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteRole, setInviteRole] = useState<MembershipRole>("Creator");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [invitesSent, setInvitesSent] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);

  const showError = useCallback(
    (text: string) => showToast(text, "error"),
    [showToast],
  );
  const pending = usePendingDeletes(showError);

  // The server PATCH for a field overwrites it blindly, so two requests for
  // the same `id:field` key must never be in flight together — whichever
  // lands second would stomp the first even if it started earlier. This
  // queue keeps at most one PATCH per key in flight and coalesces every
  // edit made in the meantime into the single newest value to send next.
  type SaveEntry = { confirmed: unknown; sending: boolean; queued?: unknown };
  const saves = useRef(new Map<string, SaveEntry>());
  const queueWrite = <T,>(
    key: string,
    previous: T,
    value: T,
    send: (value: T) => Promise<Response | undefined>,
    apply: (value: T) => void,
  ) => {
    const entry = saves.current.get(key) ?? {
      confirmed: previous,
      sending: false,
    };
    saves.current.set(key, entry);
    if (entry.sending) {
      entry.queued = value;
      return;
    }
    // Idle, so the rendered value is what the server last accepted; other
    // paths (e.g. deleting a folder) change fields without going through here.
    entry.confirmed = previous;
    entry.sending = true;
    void send(value).then((res) => {
      if (res) entry.confirmed = value;
      else if (entry.queued === undefined) apply(entry.confirmed as T);
      entry.sending = false;
      const next = entry.queued;
      if (next !== undefined) {
        entry.queued = undefined;
        queueWrite(key, entry.confirmed as T, next as T, send, apply);
      }
    });
  };

  /** Sends one optimistic write; on failure runs `revert` and toasts. */
  const write = async (
    url: string,
    method: string,
    body: unknown,
    revert: () => void,
    failText: string,
  ): Promise<Response | undefined> => {
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${method} ${res.status}`);
      return res;
    } catch {
      revert();
      showError(failText);
    }
  };

  // Real signal for the "Invite your team" Get-started check: has anyone
  // ever been invited to this workspace. Only checked when the checklist is
  // opened, so the sidebar doesn't fire an extra request on every mount.
  useEffect(() => {
    if (!checklistOpen) return;
    let cancelled = false;
    fetch("/api/invites")
      .then((res) => (res.ok ? (res.json() as Promise<unknown[]>) : []))
      .then((rows) => {
        if (!cancelled) setInvitesSent(rows.length > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [checklistOpen]);

  const openWsMenu = () => {
    setWsMenuOpen(true);
    fetch("/api/workspaces")
      .then((res) => (res.ok ? (res.json() as Promise<Workspace[]>) : []))
      .then((rows) =>
        setOtherWorkspaces(rows.filter((w) => w.id !== workspace.id)),
      )
      .catch(() => {});
  };
  const closeWsMenu = () => {
    setWsMenuOpen(false);
    setWsSubOpen(false);
  };

  const logOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const switchWorkspace = async (id: string) => {
    const res = await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      showError("Could not switch workspace");
      return;
    }
    router.push("/");
    router.refresh();
  };

  const openWsModal = () => {
    closeWsMenu();
    setNewWsName("");
    setJoinLink("");
    setWsModalOpen(true);
  };

  const createWorkspace = async () => {
    const name = newWsName.trim();
    if (!name) return;
    setWsBusy(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        showError("Could not create workspace");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setWsBusy(false);
    }
  };

  const joinWorkspace = async () => {
    const inviteUrl = joinLink.trim();
    if (!inviteUrl) return;
    setWsBusy(true);
    try {
      const res = await fetch("/api/workspaces/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteUrl }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        showError(body?.error ?? "That invite link isn't valid");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setWsBusy(false);
    }
  };

  const openInvite = () => {
    setInviteEmails("");
    setInviteRole("Creator");
    setInviteOpen(true);
  };

  const sendInvite = async () => {
    const emails = inviteEmails
      .split(/[\s,]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    setInviteBusy(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emails, role: inviteRole }),
      });
      if (!res.ok) {
        showError("Could not send invite");
        return;
      }
      setInviteOpen(false);
      setInvitesSent(true);
      showToast(`Invited ${emails.join(", ")}`);
    } finally {
      setInviteBusy(false);
    }
  };

  const startNewRewind = async () => {
    const found = await pingExtension();
    if (!found) {
      showToast("Install the Rewind extension to capture a Rewind");
    }
  };

  const toggleGroupDuplicates = () => {
    const next = !grouped;
    setGrouped(next);
    queueWrite(
      "workspace:groupDuplicates",
      grouped,
      next,
      (groupDuplicates) =>
        write(
          "/api/workspace",
          "PATCH",
          { groupDuplicates },
          () => {},
          "Could not update Group duplicates",
        ),
      setGrouped,
    );
  };

  /** Hides happen before this; the toast's `×` sends, Undo restores. */
  const deleteLater = (
    text: string,
    url: string,
    restore: () => void,
    failText: string,
  ) => {
    const key = pending.add({ url, restore, failText });
    showActionToast(text, {
      onUndo: () => pending.undo(key),
      onClose: () => pending.send(key),
    });
  };

  const openMenu = (
    e: ReactMouseEvent<HTMLElement>,
    label: string,
    items: MenuItem[],
  ) => {
    e.preventDefault();
    const fromButton = e.type === "click";
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      x: fromButton ? rect.left : e.clientX,
      y: fromButton ? rect.bottom : e.clientY,
      label,
      items,
      trigger: fromButton ? e.currentTarget : null,
    });
  };

  const renameRewind = (r: RewindListItem, title: string) => {
    setEditing(null);
    if (title === "" || title === r.title) return;
    dispatch({ type: "rename", id: r.id, title });
    queueWrite(
      `${r.id}:title`,
      r.title,
      title,
      (title) =>
        write(
          `/api/rewinds/${r.id}`,
          "PATCH",
          { title },
          () => {},
          "Could not rename Rewind",
        ),
      (title) => dispatch({ type: "rename", id: r.id, title }),
    );
  };

  const deleteRewind = (r: RewindListItem) => {
    dispatch({ type: "removeRewind", id: r.id });
    deleteLater(
      "Rewind deleted",
      `/api/rewinds/${r.id}`,
      () => dispatch({ type: "restoreRewind", rewind: r }),
      "Could not delete Rewind",
    );
  };

  const createFolder = async () => {
    const res = await write(
      "/api/folders",
      "POST",
      { name: nextFolderName(folders) },
      () => {},
      "Could not create folder",
    );
    if (!res) return;
    const row = (await res.json()) as FolderListItem;
    const folder = { ...row, createdAt: new Date(row.createdAt) };
    dispatch({ type: "addFolder", folder });
    setEditing({ kind: "folder", id: folder.id });
  };

  const renameFolder = (f: FolderListItem, name: string) => {
    setEditing(null);
    if (name === "" || name === f.name) return;
    dispatch({ type: "renameFolder", id: f.id, name });
    queueWrite(
      `${f.id}:name`,
      f.name,
      name,
      (name) =>
        write(
          `/api/folders/${f.id}`,
          "PATCH",
          { name },
          () => {},
          "Could not rename folder",
        ),
      (name) => dispatch({ type: "renameFolder", id: f.id, name }),
    );
  };

  const deleteFolder = (f: FolderListItem) => {
    const rewindIds = rewinds
      .filter((r) => r.folderId === f.id)
      .map((r) => r.id);
    dispatch({ type: "removeFolder", id: f.id });
    if (folderId === f.id) {
      setLeavingFolderId(f.id);
      goToFolder(undefined);
    }
    deleteLater(
      `Folder “${f.name}” deleted`,
      `/api/folders/${f.id}`,
      () => dispatch({ type: "restoreFolder", folder: f, rewindIds }),
      "Could not delete folder",
    );
  };

  const folderMenu = (e: ReactMouseEvent<HTMLElement>, f: FolderListItem) =>
    openMenu(e, `Actions for folder ${f.name}`, [
      {
        label: "Rename",
        onSelect: () => setEditing({ kind: "folder", id: f.id }),
      },
      { label: "Delete folder", danger: true, onSelect: () => deleteFolder(f) },
    ]);

  const rewindMenu = (e: ReactMouseEvent<HTMLElement>, r: RewindListItem) =>
    openMenu(e, `Actions for ${r.title}`, [
      {
        label: "Rename",
        onSelect: () => setEditing({ kind: "rewind", id: r.id }),
      },
      {
        label: "Move to All Rewinds",
        onSelect: () => moveRewindToFolder(r, null),
      },
      ...folders.map((f) => ({
        label: `Move to ${f.name}`,
        onSelect: () => moveRewindToFolder(r, f.id),
      })),
      ...(Object.keys(STATUS_LABEL) as RewindStatus[]).map((status) => ({
        label: `Set status: ${STATUS_LABEL[status]}`,
        onSelect: () => setRewindStatus(r, status),
      })),
      { label: "Delete Rewind", danger: true, onSelect: () => deleteRewind(r) },
    ]);

  const isEditing = (r: RewindListItem) =>
    editing?.kind === "rewind" && editing.id === r.id;

  /** The title link, or its inline rename input while editing. */
  const rewindTitle = (r: RewindListItem, className: string) =>
    isEditing(r) ? (
      <InlineRename
        label="Rewind title"
        value={r.title}
        onDone={(title) => renameRewind(r, title)}
        onCancel={() => setEditing(null)}
      />
    ) : (
      <Link href={`/r/${r.id}`} className={className}>
        {r.title}
      </Link>
    );

  const moreButton = (r: RewindListItem) => (
    <button
      type="button"
      className={styles.moreButton}
      aria-label={`Actions for ${r.title}`}
      aria-haspopup="menu"
      onClick={(e) => rewindMenu(e, r)}
    >
      ⋯
    </button>
  );

  const counts = useMemo(() => folderCounts(rewinds), [rewinds]);
  const activeFolder =
    folderId === undefined ? undefined : folders.find((f) => f.id === folderId);
  const leaving =
    folderId !== undefined && !activeFolder && leavingFolderId === folderId;
  const folderNotFound = folderId !== undefined && !activeFolder && !leaving;
  const shownRewinds = folderNotFound ? [] : filterByFolder(rewinds, folderId);
  const isAll = folderId === undefined;
  const gridRewinds = groupDuplicates(shownRewinds, isAll && grouped);
  const title =
    folderId === undefined || leaving
      ? "All Rewinds"
      : folderNotFound
        ? "Folder not found"
        : activeFolder!.name;

  const goToFolder = (id: string | undefined) => {
    router.replace(libraryUrl(view, id));
  };

  const goToView = (next: LibraryView) => {
    router.replace(libraryUrl(next, folderId));
  };

  const copyButton = (id: string) => (
    <button
      type="button"
      className={styles.copyButton}
      aria-label="Copy link"
      onClick={() => void copyLink(id)}
    >
      Copy link
    </button>
  );

  const copyLink = async (id: string) => {
    try {
      await copyRewindLink(id);
      showToast("Link copied");
    } catch {
      showToast("Could not copy link", "error");
    }
  };

  const setRewindStatus = (r: RewindListItem, status: RewindStatus) => {
    if (status === r.status) return;
    dispatch({ type: "setStatus", id: r.id, status });
    showToast(`Moved to ${STATUS_LABEL[status]}`);
    queueWrite(
      `${r.id}:status`,
      r.status,
      status,
      (status) =>
        write(
          `/api/rewinds/${r.id}`,
          "PATCH",
          { status },
          () => {},
          "Could not move Rewind",
        ),
      (status) => dispatch({ type: "setStatus", id: r.id, status }),
    );
  };

  const moveRewindToFolder = (r: RewindListItem, folder: string | null) => {
    if (folder === r.folderId) return;
    dispatch({ type: "setFolder", id: r.id, folderId: folder });
    queueWrite(
      `${r.id}:folderId`,
      r.folderId,
      folder,
      (folderId) =>
        write(
          `/api/rewinds/${r.id}`,
          "PATCH",
          { folderId },
          () => {},
          "Could not move Rewind",
        ),
      (folderId) => dispatch({ type: "setFolder", id: r.id, folderId }),
    );
  };

  const dragRewindId = (e: ReactDragEvent) =>
    e.dataTransfer.getData("text/plain");

  const draggableProps = (r: RewindListItem) => ({
    draggable: true,
    onDragStart: (e: ReactDragEvent) =>
      e.dataTransfer.setData("text/plain", r.id),
  });

  const columnDropProps = (status: RewindStatus) => ({
    onDragOver: (e: ReactDragEvent) => e.preventDefault(),
    onDragEnter: () => setColumnDropTarget(status),
    onDragLeave: () =>
      setColumnDropTarget((cur) => (cur === status ? undefined : cur)),
    onDrop: (e: ReactDragEvent) => {
      e.preventDefault();
      setColumnDropTarget(undefined);
      const dragged = rewinds.find((x) => x.id === dragRewindId(e));
      if (dragged) setRewindStatus(dragged, status);
    },
  });

  const folderDropProps = (folder: string | null) => ({
    onDragOver: (e: ReactDragEvent) => e.preventDefault(),
    onDragEnter: () => setDropTarget(folder),
    onDragLeave: () =>
      setDropTarget((cur) => (cur === folder ? undefined : cur)),
    onDrop: (e: ReactDragEvent) => {
      e.preventDefault();
      setDropTarget(undefined);
      const dragged = rewinds.find((x) => x.id === dragRewindId(e));
      // Event handler, not render: queueWrite reads saves.current only when called.
      // eslint-disable-next-line react-hooks/refs
      if (dragged) moveRewindToFolder(dragged, folder);
    },
  });

  const toggleDark = (next: boolean) => {
    setTheme(next);
    themeStore.notify();
  };

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setQuery("");
    setSelected(0);
  }, []);

  const openPalette = useCallback(() => {
    setPaletteOpen(true);
    setQuery("");
    setSelected(0);
  }, []);

  const runPaletteItem = (item: PaletteItem) => {
    closePalette();
    switch (item.kind) {
      case "all":
        goToFolder(undefined);
        break;
      case "folder":
        goToFolder(item.id);
        break;
      case "view":
        goToView(item.id);
        break;
      case "theme":
        toggleDark(item.dark);
        break;
      case "rewind":
        router.push(`/r/${item.id}`);
        break;
      case "command":
        switch (item.id) {
          case "links":
            router.push("/links");
            break;
          case "helpdesk":
            router.push("/helpdesk");
            break;
          case "invite":
            openInvite();
            break;
          case "workspace":
            openWsModal();
            break;
        }
        break;
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setSelected(0);
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const items = useMemo(
    () =>
      filterPalette(
        paletteItems(rewinds, folders, dark, SHELL_COMMANDS),
        query,
      ),
    [rewinds, folders, dark, query],
  );

  const usedExtension = rewinds.some((r) => r.reporterName === userName);
  const checks = getStartedChecks({
    hasRewinds: rewinds.length > 0,
    usedExtension,
    invitesSent,
  });
  const checkProgress = getStartedProgress(checks);
  const workspaceInitials = initials(workspace.name);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className={styles.workspaceButton}
            onClick={() => (wsMenuOpen ? closeWsMenu() : openWsMenu())}
          >
            <span className={styles.workspaceAvatar}>{workspaceInitials}</span>
            <span className={styles.workspaceName}>{workspace.name}</span>
          </button>
          {wsMenuOpen && (
            <>
              <div className={styles.menuBackdrop} onClick={closeWsMenu} />
              <div className={styles.wsMenu} role="menu">
                <div className={styles.wsMenuHeader}>
                  <span className={styles.workspaceAvatar}>
                    {workspaceInitials}
                  </span>
                  <span className={styles.workspaceName}>
                    {workspace.name}
                  </span>
                </div>
                <Link
                  href="/settings/general"
                  className={styles.menuItem}
                  role="menuitem"
                >
                  Settings
                </Link>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className={styles.menuItem}
                    role="menuitem"
                    onMouseEnter={() => setWsSubOpen(true)}
                    onClick={() => setWsSubOpen((open) => !open)}
                  >
                    Switch workspace
                  </button>
                  {wsSubOpen && (
                    <div className={styles.wsSubmenu} role="menu">
                      {otherWorkspaces.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          className={styles.menuItem}
                          role="menuitem"
                          onClick={() => void switchWorkspace(w.id)}
                        >
                          {w.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={styles.menuItem}
                        role="menuitem"
                        onClick={openWsModal}
                      >
                        Join or create workspace
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => void logOut()}
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
        <button type="button" className={styles.search} onClick={openPalette}>
          <span className={styles.searchLabel}>Search or jump to…</span>
          <span className={styles.kbd}>⌘K</span>
        </button>
        <button
          type="button"
          className={`${styles.navItem} ${folderId === undefined ? styles.navActive : ""} ${dropTarget === null ? styles.dropTarget : ""}`}
          onClick={() => goToFolder(undefined)}
          {...folderDropProps(null)}
        >
          All Rewinds
        </button>
        <Link href="/links" className={styles.navItem}>
          Recording links
        </Link>
        {flags.HELPDESK && (
          <Link href="/helpdesk" className={styles.navItem}>
            Helpdesk
          </Link>
        )}
        <div className={styles.foldersHeading}>
          Folders
          <button
            type="button"
            className={styles.moreButton}
            aria-label="New folder"
            onClick={() => void createFolder()}
          >
            +
          </button>
        </div>
        {folders.map((f) =>
          editing?.kind === "folder" && editing.id === f.id ? (
            <InlineRename
              key={f.id}
              label="Folder name"
              value={f.name}
              onDone={(name) => renameFolder(f, name)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div
              key={f.id}
              className={styles.folderRow}
              onContextMenu={(e) => folderMenu(e, f)}
            >
              <button
                type="button"
                className={`${styles.navItem} ${folderId === f.id ? styles.navActive : ""} ${dropTarget === f.id ? styles.dropTarget : ""}`}
                onClick={() => goToFolder(f.id)}
                {...folderDropProps(f.id)}
              >
                <span className={styles.dot} />
                <span className={styles.navLabel}>{f.name}</span>
                <span className={styles.navCount}>{counts[f.id] ?? 0}</span>
              </button>
              <button
                type="button"
                className={styles.moreButton}
                aria-label={`Actions for folder ${f.name}`}
                aria-haspopup="menu"
                onClick={(e) => folderMenu(e, f)}
              >
                ⋯
              </button>
            </div>
          ),
        )}
        <div className={styles.getStarted}>
          <button
            type="button"
            className={styles.getStartedButton}
            onClick={() => setChecklistOpen((open) => !open)}
          >
            <span className={styles.getStartedTitle}>Get started</span>
            <span className={styles.getStartedLabel}>
              {checkProgress.done} of {checkProgress.total} done
            </span>
          </button>
          {checklistOpen && (
            <div className={styles.getStartedList}>
              {checks.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`${styles.getStartedCheck} ${c.done ? styles.getStartedDone : ""}`}
                  onClick={
                    c.key === "invite"
                      ? openInvite
                      : () => void startNewRewind()
                  }
                >
                  <span
                    className={`${styles.checkDot} ${c.done ? styles.checkDotDone : ""}`}
                  />
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.bottomRow}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Help"
            onClick={() => setHelpOpen((open) => !open)}
          >
            ?
          </button>
          {helpOpen && (
            <>
              <div
                className={styles.menuBackdrop}
                onClick={() => setHelpOpen(false)}
              />
              <div className={styles.helpMenu} role="menu">
                {flags.EXTERNAL_LINKS && (
                  <>
                    <a
                      href="https://rewind.dev/docs"
                      target="_blank"
                      rel="noreferrer"
                      className={styles.menuItem}
                      role="menuitem"
                    >
                      Docs
                    </a>
                    <a
                      href="mailto:support@rewind.dev"
                      className={styles.menuItem}
                      role="menuitem"
                    >
                      Contact support
                    </a>
                  </>
                )}
              </div>
            </>
          )}
          <button
            type="button"
            className={styles.themeToggle}
            aria-pressed={dark}
            aria-label="Toggle dark mode"
            onClick={() => toggleDark(!dark)}
          >
            <span aria-hidden="true">{dark ? "☀" : "🌙"}</span>
          </button>
          <div className={styles.spacer} />
          <Link href="/settings/general" className={styles.settingsLink}>
            Settings
          </Link>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.title}>{title}</div>
          <div className={styles.count}>{shownRewinds.length} Rewinds</div>
          <div className={styles.spacer} />
          <div className={styles.segment} role="radiogroup" aria-label="View">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={view === v.key}
                className={`${styles.segmentItem} ${view === v.key ? styles.segmentActive : ""}`}
                onClick={() => goToView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
          {isAll && (
            <button
              type="button"
              className={styles.groupToggle}
              role="switch"
              aria-checked={grouped}
              onClick={toggleGroupDuplicates}
            >
              <span
                className={`${styles.switchTrack} ${grouped ? styles.switchTrackOn : ""}`}
              >
                <span className={styles.switchThumb} />
              </span>
              Group duplicates
            </button>
          )}
          <button
            type="button"
            className={styles.headerButton}
            onClick={openInvite}
          >
            Invite
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void startNewRewind()}
          >
            New Rewind
          </button>
        </header>

        <div className={styles.body}>
          {view === "grid" && (
            <div className={styles.grid}>
              {gridRewinds.map((r) => (
                <div
                  key={r.id}
                  className={`${styles.card} ${r.stackCount > 1 ? styles.cardStacked : ""}`}
                  onContextMenu={(e) => rewindMenu(e, r)}
                  {...draggableProps(r)}
                >
                  <Link href={`/r/${r.id}`} className={styles.cardLink}>
                    <div className={styles.thumb}>
                      <span className={styles.duration}>{duration(r)}</span>
                      {r.stackCount > 1 && (
                        <span className={styles.stackBadge}>
                          {r.stackCount} similar
                        </span>
                      )}
                    </div>
                  </Link>
                  {rewindTitle(r, styles.cardTitle)}
                  <div className={styles.cardMeta}>
                    <Avatar name={r.reporterName} />
                    <span className={styles.metaText}>
                      {r.url} ·{" "}
                      <time
                        dateTime={r.createdAt.toISOString()}
                        suppressHydrationWarning
                      >
                        {timeAgo(r.createdAt)}
                      </time>
                    </span>
                    <span className={styles.status}>
                      {STATUS_LABEL[r.status as RewindStatus]}
                    </span>
                    {moreButton(r)}
                  </div>
                  {copyButton(r.id)}
                </div>
              ))}
            </div>
          )}

          {view === "list" && (
            <div className={styles.list} role="table">
              <div className={styles.listHead} role="row">
                <span role="columnheader">Title</span>
                <span role="columnheader">Page</span>
                <span role="columnheader">Reporter</span>
                <span role="columnheader">Length</span>
                <span role="columnheader">Status</span>
                <span role="columnheader" />
              </div>
              {shownRewinds.map((r) => (
                <div
                  key={r.id}
                  className={styles.listRow}
                  role="row"
                  onContextMenu={(e) => rewindMenu(e, r)}
                  {...draggableProps(r)}
                >
                  <span className={styles.listCell} role="cell">
                    {rewindTitle(r, styles.listTitle)}
                  </span>
                  <span className={styles.listMuted} role="cell">
                    {r.url}
                  </span>
                  <span className={styles.listReporter} role="cell">
                    <Avatar name={r.reporterName} />
                    {r.reporterName}
                  </span>
                  <span className={styles.listMuted} role="cell">
                    {duration(r)}
                  </span>
                  <span role="cell">
                    <span className={styles.status}>
                      {STATUS_LABEL[r.status as RewindStatus]}
                    </span>
                  </span>
                  <span className={styles.listActions} role="cell">
                    {copyButton(r.id)}
                    {moreButton(r)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {view === "board" && (
            <div className={styles.board}>
              {boardColumns(shownRewinds).map((c) => (
                <section
                  key={c.status}
                  className={`${styles.column} ${columnDropTarget === c.status ? styles.columnDropTarget : ""}`}
                  aria-label={c.label}
                  {...columnDropProps(c.status)}
                >
                  <div className={styles.columnHead}>
                    <span
                      className={styles.columnDot}
                      style={{ background: COLUMN_COLOR[c.status] }}
                    />
                    {c.label}
                    <span className={styles.columnCount}>
                      {c.rewinds.length}
                    </span>
                  </div>
                  {c.rewinds.map((r) => (
                    <div
                      key={r.id}
                      className={styles.boardCard}
                      onContextMenu={(e) => rewindMenu(e, r)}
                      {...draggableProps(r)}
                    >
                      {rewindTitle(r, styles.boardTitle)}
                      <div className={styles.boardUrl}>{r.url}</div>
                      <div className={styles.boardMeta}>
                        <Avatar name={r.reporterName} />
                        <span>{duration(r)}</span>
                        <span className={styles.spacer} />
                        {r.errorCount > 0 && (
                          <span className={styles.errors}>
                            {r.errorCount}{" "}
                            {r.errorCount === 1 ? "error" : "errors"}
                          </span>
                        )}
                        {copyButton(r.id)}
                        {moreButton(r)}
                      </div>
                    </div>
                  ))}
                  {c.rewinds.length === 0 && (
                    <div className={styles.emptyColumn}>Drop Rewinds here</div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {menu && (
        <ContextMenu
          {...menu}
          onClose={() => {
            menu.trigger?.focus();
            setMenu(null);
          }}
        />
      )}
      <ToastStack toasts={toasts} onUndo={undo} onClose={close} />
      {paletteOpen && (
        <Palette
          items={items}
          query={query}
          selected={selected}
          onQueryChange={(q) => {
            setQuery(q);
            setSelected(0);
          }}
          onSelectedChange={setSelected}
          onRun={runPaletteItem}
          onClose={closePalette}
        />
      )}
      {wsModalOpen && (
        <div className={styles.modalScrim} onClick={() => setWsModalOpen(false)}>
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                Join or create workspace
              </span>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Close"
                onClick={() => setWsModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <label className={styles.modalLabel} htmlFor="new-workspace-name">
              Create a new workspace
            </label>
            <div className={styles.modalRow}>
              <input
                id="new-workspace-name"
                className={styles.modalInput}
                placeholder="Workspace name"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createWorkspace();
                }}
              />
              <button
                type="button"
                className={styles.primaryButton}
                disabled={wsBusy || !newWsName.trim()}
                onClick={() => void createWorkspace()}
              >
                Create
              </button>
            </div>
            <div className={styles.modalDivider}>or</div>
            <label className={styles.modalLabel} htmlFor="join-workspace-link">
              Join with an invite link
            </label>
            <div className={styles.modalRow}>
              <input
                id="join-workspace-link"
                className={styles.modalInput}
                placeholder="https://…/team-invite/…"
                value={joinLink}
                onChange={(e) => setJoinLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void joinWorkspace();
                }}
              />
              <button
                type="button"
                className={styles.headerButton}
                disabled={wsBusy || !joinLink.trim()}
                onClick={() => void joinWorkspace()}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}
      {inviteOpen && (
        <div className={styles.modalScrim} onClick={() => setInviteOpen(false)}>
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Add members</span>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Close"
                onClick={() => setInviteOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalRow}>
              <input
                className={styles.modalInput}
                placeholder="Separate emails with a space"
                aria-label="Emails to invite"
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendInvite();
                }}
              />
              <select
                className={styles.modalSelect}
                aria-label="Role"
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as MembershipRole)
                }
              >
                <option>Creator</option>
                <option>Admin</option>
                <option>Viewer</option>
              </select>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={inviteBusy || !inviteEmails.trim()}
                onClick={() => void sendInvite()}
              >
                Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ContextMenuProps = {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: () => void;
};

/** A `role="menu"` popup; Escape or a click outside closes it. */
function ContextMenu({ x, y, label, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
  }, []);
  return (
    <>
      <div
        className={styles.menuBackdrop}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        className={styles.menu}
        style={{ left: x, top: y }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${item.danger ? styles.menuDanger : ""}`}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

type InlineRenameProps = {
  label: string;
  value: string;
  onDone: (value: string) => void;
  onCancel: () => void;
};

/** Enter and blur commit the trimmed value; Escape cancels. */
function InlineRename({ label, value, onDone, onCancel }: InlineRenameProps) {
  const [draft, setDraft] = useState(value);
  const finished = useRef(false);
  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit) onDone(draft.trim());
    else onCancel();
  };
  return (
    <input
      autoFocus
      aria-label={label}
      className={styles.renameInput}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}

const PALETTE_KIND_LABEL: Record<PaletteItem["kind"], string> = {
  all: "Navigate",
  folder: "Folder",
  view: "View",
  theme: "Appearance",
  rewind: "Rewind",
  command: "Action",
};

function paletteItemKey(item: PaletteItem): string {
  return item.kind === "all" || item.kind === "theme"
    ? item.kind
    : `${item.kind}-${item.id}`;
}

type PaletteProps = {
  items: PaletteItem[];
  query: string;
  selected: number;
  onQueryChange: (query: string) => void;
  onSelectedChange: (index: number) => void;
  onRun: (item: PaletteItem) => void;
  onClose: () => void;
};

/** `⌘K` search: a filtered, arrow-navigable list of every jump target. */
function Palette({
  items,
  query,
  selected,
  onQueryChange,
  onSelectedChange,
  onRun,
  onClose,
}: PaletteProps) {
  const activeId =
    items.length > 0
      ? `palette-item-${paletteItemKey(items[selected])}`
      : undefined;
  return (
    <>
      <div className={styles.menuBackdrop} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search or jump to…"
        className={styles.palette}
      >
        <input
          autoFocus
          aria-label="Search or jump to…"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-listbox"
          aria-activedescendant={activeId}
          className={styles.paletteInput}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (items.length > 0)
                onSelectedChange((selected + 1) % items.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (items.length > 0)
                onSelectedChange((selected - 1 + items.length) % items.length);
            } else if (e.key === "Enter") {
              if (items[selected]) onRun(items[selected]);
            }
          }}
        />
        <div id="palette-listbox" role="listbox" className={styles.paletteList}>
          {items.length === 0 && (
            <div className={styles.paletteEmpty}>No results</div>
          )}
          {items.map((item, i) => (
            <div
              key={paletteItemKey(item)}
              id={`palette-item-${paletteItemKey(item)}`}
              role="option"
              aria-selected={i === selected}
              className={`${styles.paletteItem} ${i === selected ? styles.paletteActive : ""}`}
              onMouseEnter={() => onSelectedChange(i)}
              onClick={() => onRun(item)}
            >
              <span className={styles.paletteLabel}>{item.label}</span>
              <span className={styles.paletteKind}>
                {PALETTE_KIND_LABEL[item.kind]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

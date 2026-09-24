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
import { usePendingDeletes } from "@/lib/use-pending-deletes";
import {
  boardColumns,
  filterByFolder,
  filterPalette,
  folderCounts,
  libraryReducer,
  nextFolderName,
  paletteItems,
  type LibraryView,
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

type Props = {
  rewinds: RewindListItem[];
  folders: FolderListItem[];
  view: LibraryView;
  folderId?: string;
};

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

export function Library(props: Props) {
  const { view, folderId } = props;
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
    () => filterPalette(paletteItems(rewinds, folders, dark), query),
    [rewinds, folders, dark, query],
  );

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
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
        <button
          type="button"
          className={styles.themeToggle}
          aria-pressed={dark}
          aria-label="Toggle dark mode"
          onClick={() => toggleDark(!dark)}
        >
          <span aria-hidden="true">{dark ? "☀" : "🌙"}</span>
          Toggle dark mode
        </button>
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
        </header>

        <div className={styles.body}>
          {view === "grid" && (
            <div className={styles.grid}>
              {shownRewinds.map((r) => (
                <div
                  key={r.id}
                  className={styles.card}
                  onContextMenu={(e) => rewindMenu(e, r)}
                  {...draggableProps(r)}
                >
                  <Link href={`/r/${r.id}`} className={styles.cardLink}>
                    <div className={styles.thumb}>
                      <span className={styles.duration}>{duration(r)}</span>
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

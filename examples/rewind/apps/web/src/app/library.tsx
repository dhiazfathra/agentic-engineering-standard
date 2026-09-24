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
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { RewindStatus } from "@rewind/schema";
import { ToastStack, useToast } from "@/components/toast";
import { copyRewindLink } from "@/lib/copy-link";
import { usePendingDeletes } from "@/lib/use-pending-deletes";
import {
  boardColumns,
  filterByFolder,
  folderCounts,
  libraryReducer,
  nextFolderName,
  type LibraryView,
} from "@/lib/library";
import type { FolderListItem, RewindListItem } from "@/lib/rewinds";
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

  const showError = useCallback(
    (text: string) => showToast(text, "error"),
    [showToast],
  );
  const pending = usePendingDeletes(showError);

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
    void write(
      `/api/rewinds/${r.id}`,
      "PATCH",
      { title },
      () => dispatch({ type: "rename", id: r.id, title: r.title }),
      "Could not rename Rewind",
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
    void write(
      `/api/folders/${f.id}`,
      "PATCH",
      { name },
      () => dispatch({ type: "renameFolder", id: f.id, name: f.name }),
      "Could not rename folder",
    );
  };

  const deleteFolder = (f: FolderListItem) => {
    const rewindIds = rewinds
      .filter((r) => r.folderId === f.id)
      .map((r) => r.id);
    dispatch({ type: "removeFolder", id: f.id });
    if (folderId === f.id) goToFolder(undefined);
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
  const folderNotFound = folderId !== undefined && !activeFolder;
  const shownRewinds = folderNotFound ? [] : filterByFolder(rewinds, folderId);
  const title =
    folderId === undefined
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

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <button type="button" className={styles.search}>
          <span className={styles.searchLabel}>Search or jump to…</span>
          <span className={styles.kbd}>⌘K</span>
        </button>
        <button
          type="button"
          className={`${styles.navItem} ${folderId === undefined ? styles.navActive : ""}`}
          onClick={() => goToFolder(undefined)}
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
                className={`${styles.navItem} ${folderId === f.id ? styles.navActive : ""}`}
                onClick={() => goToFolder(f.id)}
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
                  className={styles.column}
                  aria-label={c.label}
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { RewindStatus } from "@rewind/schema";
import { ToastStack, useToast } from "@/components/toast";
import { copyRewindLink } from "@/lib/copy-link";
import {
  boardColumns,
  filterByFolder,
  folderCounts,
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

export function Library({ rewinds, folders, view, folderId }: Props) {
  const router = useRouter();
  const { toasts, showToast, undo, close } = useToast();

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
        <div className={styles.foldersHeading}>Folders</div>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.navItem} ${folderId === f.id ? styles.navActive : ""}`}
            onClick={() => goToFolder(f.id)}
          >
            <span className={styles.dot} />
            <span className={styles.navLabel}>{f.name}</span>
            <span className={styles.navCount}>{counts[f.id] ?? 0}</span>
          </button>
        ))}
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
                <div key={r.id} className={styles.card}>
                  <Link href={`/r/${r.id}`} className={styles.cardLink}>
                    <div className={styles.thumb}>
                      <span className={styles.duration}>{duration(r)}</span>
                    </div>
                    <div className={styles.cardTitle}>{r.title}</div>
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
                    </div>
                  </Link>
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
                <div key={r.id} className={styles.listRow} role="row">
                  <Link
                    href={`/r/${r.id}`}
                    className={styles.listTitle}
                    role="cell"
                  >
                    {r.title}
                  </Link>
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
                  <span role="cell">{copyButton(r.id)}</span>
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
                    <div key={r.id} className={styles.boardCard}>
                      <Link href={`/r/${r.id}`} className={styles.boardTitle}>
                        {r.title}
                      </Link>
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

      <ToastStack toasts={toasts} onUndo={undo} onClose={close} />
    </div>
  );
}

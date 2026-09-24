"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { RewindStatus } from "@rewind/schema";
import { ToastStack, useToast } from "@/components/toast";
import { copyRewindLink } from "@/lib/copy-link";
import { filterByFolder, folderCounts, type LibraryView } from "@/lib/library";
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
          {/* T4 builds list and board; for now every view renders the grid. */}
          <div className={styles.grid}>
            {shownRewinds.map((r) => (
              <div key={r.id} className={styles.card}>
                <Link href={`/r/${r.id}`} className={styles.cardLink}>
                  <div className={styles.thumb}>
                    <span className={styles.duration}>
                      {r.durationSeconds ? formatTime(r.durationSeconds) : "—"}
                    </span>
                  </div>
                  <div className={styles.cardTitle}>{r.title}</div>
                  <div className={styles.cardMeta}>
                    <span
                      className={styles.avatar}
                      style={{ background: personColor(r.reporterName) }}
                    >
                      {initials(r.reporterName)}
                    </span>
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
                <button
                  type="button"
                  className={styles.copyButton}
                  aria-label="Copy link"
                  onClick={() => void copyLink(r.id)}
                >
                  Copy link
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ToastStack toasts={toasts} onUndo={undo} onClose={close} />
    </div>
  );
}

"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ToastStack, useToast } from "@/components/toast";
import { flags } from "@/lib/flags";
import type { RecordingLinkListItem } from "@/lib/rewinds";
import styles from "./links.module.css";

type Props = {
  links: RecordingLinkListItem[];
  userId: string;
};

function onboardingKey(userId: string): string {
  return `rw-links-onboarding-dismissed-${userId}`;
}

function recordingUrl(id: string): string {
  return `${location.origin}/rec/${id}`;
}

// Reads the per-user dismissal directly (no listener fires it — dismissal
// happens in this same component), so `subscribe` is a no-op.
// getServerSnapshot keeps the modal closed for the server render and the
// first client render, matching learning/LESSONS.md on hydration mismatches
// from browser-only state read during render.
function makeOnboardingStore(userId: string) {
  return {
    subscribe: () => () => {},
    getSnapshot: () => {
      try {
        return !window.localStorage.getItem(onboardingKey(userId));
      } catch {
        return false;
      }
    },
    getServerSnapshot: () => false,
  };
}

export function LinksPage({ links: initialLinks, userId }: Props) {
  const { toasts, showToast, undo, close } = useToast();
  const [links, setLinks] = useState(initialLinks);
  const [creating, setCreating] = useState(false);
  const [dismissedThisRender, setDismissedThisRender] = useState(false);

  const onboardStore = useMemo(() => makeOnboardingStore(userId), [userId]);
  const shouldOnboard = useSyncExternalStore(
    onboardStore.subscribe,
    onboardStore.getSnapshot,
    onboardStore.getServerSnapshot,
  );
  const onboardOpen = shouldOnboard && !dismissedThisRender;

  function dismissOnboarding() {
    setDismissedThisRender(true);
    try {
      window.localStorage.setItem(onboardingKey(userId), "1");
    } catch {
      // Best effort only; nothing to recover from here.
    }
  }

  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(recordingUrl(id));
      showToast("Link copied");
    } catch {
      showToast("Couldn't copy link", "error");
    }
  }

  async function createLink() {
    setCreating(true);
    try {
      const res = await fetch("/api/recording-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `New recording link ${links.length + 1}`,
        }),
      });
      if (!res.ok) {
        showToast("Couldn't create recording link", "error");
        return;
      }
      const row = (await res.json()) as Omit<
        RecordingLinkListItem,
        "createdAt"
      > & { createdAt: string };
      setLinks((prev) => [
        { ...row, createdAt: new Date(row.createdAt), rewindCount: 0 },
        ...prev,
      ]);
      await copyLink(row.id);
    } catch {
      showToast("Couldn't create recording link", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>Recording links</div>
        <div className={styles.spacer} />
        {flags.SDK && (
          <button
            type="button"
            title="Connect your domain"
            className={styles.iconButton}
            aria-label="Connect your domain"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className={styles.newLink}
          onClick={createLink}
          disabled={creating}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {creating ? "…" : "New recording link"}
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.table}>
          <div className={styles.headRow}>
            <span>Link</span>
            <span>Created</span>
            <span>Recordings</span>
            <span />
          </div>
          {links.length === 0 ? (
            <div className={styles.row}>
              <span className={styles.empty}>No recording links yet</span>
            </div>
          ) : (
            links.map((l) => (
              <div className={styles.row} key={l.id}>
                <span className={styles.name}>
                  <span className={styles.nameIcon}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
                    </svg>
                  </span>
                  {l.name}
                </span>
                <time
                  className={styles.created}
                  dateTime={l.createdAt.toISOString()}
                  suppressHydrationWarning
                >
                  {l.createdAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <span className={styles.count}>{l.rewindCount}</span>
                <button
                  type="button"
                  className={styles.copy}
                  onClick={() => copyLink(l.id)}
                >
                  Copy link
                </button>
              </div>
            ))
          )}
        </div>
        <p className={styles.caption}>
          Recordings from these links land in All Rewinds, tagged with the
          link name.
        </p>
      </div>
      {onboardOpen && (
        <div className={styles.scrim}>
          <div className={styles.onboard}>
            <div className={styles.onboardTitle}>Recording links</div>
            <p className={styles.onboardBody}>
              Ask anyone to record their screen, no extension needed. Share a
              link and their recording lands in All Rewinds automatically.
            </p>
            <button
              type="button"
              className={styles.onboardClose}
              onClick={dismissOnboarding}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onUndo={undo} onClose={close} />
    </div>
  );
}

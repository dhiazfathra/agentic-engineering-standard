"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RewindStatus } from "@rewind/schema";
import type { RewindDetail } from "@/lib/rewinds";
import {
  commentsNear,
  currentEventIndex,
  EVENT_TAG,
  formatTime,
  initials,
  personColor,
  STATUS_LABEL,
  stepsToReproduce,
  tabEvents,
  timeAgo,
  timelineMarkers,
  type ViewerTab,
} from "@/lib/viewer";
import styles from "./viewer.module.css";

type Props = {
  rewind: RewindDetail;
  mediaUrl: string;
};

type Toast = { text: string; tone: "ok" | "error" };

type Draft = { x: number; y: number; t: number };

const TABS: { key: ViewerTab; label: string }[] = [
  { key: "info", label: "Info" },
  { key: "events", label: "Events" },
  { key: "console", label: "Console" },
  { key: "network", label: "Network" },
  { key: "comments", label: "Comments" },
];

const AUTHOR_STORAGE_KEY = "rewind:comment-author";

function readStoredAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeAuthor(name: string): void {
  try {
    localStorage.setItem(AUTHOR_STORAGE_KEY, name);
  } catch {
    // localStorage unavailable (private mode, blocked storage): comment
    // posting still works, the browser just won't remember the name.
  }
}

export function Viewer({ rewind, mediaUrl }: Props) {
  const [tab, setTab] = useState<ViewerTab>("info");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [status, setStatus] = useState<RewindStatus>(
    rewind.status as RewindStatus,
  );
  const [comments, setComments] = useState(rewind.comments);
  const [commentMode, setCommentMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [authorName, setAuthorName] = useState(() => readStoredAuthor());
  const [toast, setToast] = useState<Toast | null>(null);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const duration = rewind.durationSeconds ?? 0;
  const isVideo = rewind.kind === "video";
  const events = rewind.events;

  // Assigned after mount, once the onError listener above is attached, so a
  // fast local error (this is what happens for every seeded Rewind, whose
  // mediaKey never has a stored object) is never missed. Media "error"
  // events do not bubble, so React's delegated listener must already be on
  // the element before the browser starts the request.
  useEffect(() => {
    // mediaError is false on the mount this effect runs after, so the
    // matching ref (video or img) is always attached to its element here.
    if (isVideo) mediaRef.current!.src = mediaUrl;
    else imgRef.current!.src = mediaUrl;
  }, [isVideo, mediaUrl]);

  const showToast = (next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const seek = (next: number) => {
    const clamped = Math.max(0, Math.min(duration, next));
    setPlaying(false);
    setT(clamped);
    if (mediaRef.current && !mediaError) mediaRef.current.currentTime = clamped;
  };

  const togglePlay = () => {
    // The play button is disabled while there is no media (screenshots)
    // or media has errored, so this only runs against a real video.
    const video = mediaRef.current!;
    if (playing) {
      video.pause();
    } else {
      void video.play();
    }
  };

  const markers = useMemo(
    () => timelineMarkers(events, duration),
    [events, duration],
  );
  const commentMarks = useMemo(
    () =>
      comments.map((c) => ({
        ...c,
        leftPct: duration > 0 ? (c.t / duration) * 100 : 0,
      })),
    [comments, duration],
  );
  const pinnedComments = useMemo(
    () => commentsNear(comments, t),
    [comments, t],
  );
  const currentIndex = useMemo(() => currentEventIndex(events, t), [events, t]);
  const steps = useMemo(() => stepsToReproduce(events), [events]);
  const tabRows = useMemo(() => tabEvents(events, tab), [events, tab]);

  const onVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!commentMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDraft({
      x: Math.round(((e.clientX - rect.left) / rect.width) * 100),
      y: Math.round(((e.clientY - rect.top) / rect.height) * 100),
      t: Math.floor(t),
    });
    setDraftText("");
    setPlaying(false);
  };

  const onTimelineClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - rect.left) / rect.width) * duration);
  };

  const cancelDraft = () => {
    setDraft(null);
    setDraftText("");
  };

  const postDraft = async () => {
    // Only called from the draft popover, which renders only while `draft`
    // is set, so `draft` is always non-null here.
    const at = draft!;
    if (!draftText.trim()) return;
    const author = authorName.trim();
    if (!author) {
      showToast({ text: "Enter your name to comment", tone: "error" });
      return;
    }
    const body = {
      t: at.t,
      x: at.x,
      y: at.y,
      author,
      text: draftText.trim(),
    };
    try {
      const res = await fetch(`/api/rewinds/${rewind.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const row = await res.json();
      setComments((prev) => [...prev, row]);
      storeAuthor(author);
      setDraft(null);
      setDraftText("");
      setCommentMode(false);
      setTab("comments");
      showToast({ text: "Comment added", tone: "ok" });
    } catch {
      showToast({ text: "Could not post comment", tone: "error" });
    }
  };

  const onStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as RewindStatus;
    const previous = status;
    setStatus(next);
    try {
      const res = await fetch(`/api/rewinds/${rewind.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch {
      setStatus(previous);
      showToast({ text: "Could not update status", tone: "error" });
    }
  };

  const copyLink = async () => {
    const link = `${location.origin}/r/${rewind.id}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast({ text: "Link copied", tone: "ok" });
    } catch {
      showToast({ text: "Could not copy link", tone: "error" });
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="Back to Rewinds">
          ←
        </Link>
        <div className={styles.headerText}>
          <div className={styles.title}>{rewind.title}</div>
          <div className={styles.meta}>
            {rewind.reporterName} · {timeAgo(rewind.createdAt)} ·{" "}
            <a href={rewind.url} target="_blank" rel="noreferrer">
              {rewind.url}
            </a>
          </div>
        </div>
        <select
          className={styles.status}
          value={status}
          onChange={onStatusChange}
          aria-label="Status"
        >
          {(Object.keys(STATUS_LABEL) as RewindStatus[]).map((key) => (
            <option key={key} value={key}>
              {STATUS_LABEL[key]}
            </option>
          ))}
        </select>
        <button type="button" className={styles.copyLink} onClick={copyLink}>
          Copy link
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.left}>
          <div
            className={`${styles.mediaFrame} ${commentMode ? styles.commentMode : ""}`}
            onClick={onVideoClick}
          >
            {mediaError ? (
              <div className={styles.mediaUnavailable}>Media unavailable</div>
            ) : isVideo ? (
              <video
                ref={mediaRef}
                className={styles.media}
                onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => setMediaError(true)}
              />
            ) : (
              // A presigned MinIO URL: unknown at build time, so next/image's
              // static optimization does not apply. The `src` is assigned
              // imperatively below, after the error listener is attached, so
              // an error the browser raises during a server-rendered
              // hydration race is never missed (media "error" events do not
              // bubble, so React must have the listener attached first).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                className={styles.media}
                alt={rewind.title}
                onError={() => setMediaError(true)}
              />
            )}
            {pinnedComments.map((c) => (
              <div key={c.id}>
                <div
                  className={styles.pin}
                  style={{
                    left: `${Math.min(c.x, 90)}%`,
                    top: `${Math.min(c.y, 90)}%`,
                    background: personColor(c.author),
                  }}
                >
                  {initials(c.author)}
                </div>
                <div
                  className={styles.pinBubble}
                  style={{
                    left: `${Math.min(c.x, 90)}%`,
                    top: `${Math.min(c.y, 90)}%`,
                  }}
                >
                  <div className={styles.pinBubbleAuthor}>{c.author}</div>
                  {c.text}
                </div>
              </div>
            ))}
            {draft && (
              <div
                className={styles.draftPopover}
                style={{
                  left: `${Math.min(draft.x, 68)}%`,
                  top: `${Math.min(draft.y, 70)}%`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.draftTime}>
                  Comment at {formatTime(draft.t)}
                </div>
                {!authorName && (
                  <input
                    className={styles.draftInput}
                    placeholder="Your name"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    aria-label="Your name"
                  />
                )}
                <input
                  className={styles.draftInput}
                  placeholder="Add a comment"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void postDraft();
                  }}
                  aria-label="Comment text"
                  autoFocus
                />
                <div className={styles.draftActions}>
                  <button
                    type="button"
                    className={styles.draftCancel}
                    onClick={cancelDraft}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.draftPost}
                    onClick={() => void postDraft()}
                  >
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>

          {isVideo && (
            <div className={styles.player}>
              <button
                type="button"
                className={styles.playButton}
                onClick={togglePlay}
                disabled={mediaError}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? "⏸" : "▶"}
              </button>
              <button
                type="button"
                className={styles.skip}
                onClick={() => seek(t - 5)}
              >
                −5s
              </button>
              <button
                type="button"
                className={styles.skip}
                onClick={() => seek(t + 5)}
              >
                +5s
              </button>
              <div className={styles.timelineWrap}>
                {commentMarks.map((c) => (
                  <div
                    key={c.id}
                    className={styles.commentMark}
                    style={{
                      left: `${c.leftPct}%`,
                      background: personColor(c.author),
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => seek(c.t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") seek(c.t);
                    }}
                  >
                    {initials(c.author)}
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.timeline}
                  onClick={onTimelineClick}
                  role="slider"
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={t}
                >
                  <div className={styles.timelineTrack} />
                  <div
                    className={styles.timelineFill}
                    style={{
                      width: `${duration > 0 ? (t / duration) * 100 : 0}%`,
                    }}
                  />
                  {markers.map((m) => (
                    <div
                      key={m.t}
                      className={styles.timelineMarker}
                      style={{
                        left: `${m.leftPct}%`,
                        height: m.tone === "error" ? "14px" : "8px",
                        background:
                          m.tone === "error"
                            ? "#e35e5e"
                            : m.tone === "nav"
                              ? "#01afaf"
                              : "#99a1af",
                      }}
                    />
                  ))}
                  <div
                    className={styles.timelineHandle}
                    style={{
                      left: `${duration > 0 ? (t / duration) * 100 : 0}%`,
                    }}
                  />
                </button>
              </div>
              <div className={styles.time}>
                {formatTime(t)} / {formatTime(duration)}
              </div>
              <button
                type="button"
                className={`${styles.commentToggle} ${commentMode ? styles.active : ""}`}
                onClick={() => {
                  setCommentMode((v) => !v);
                  setDraft(null);
                  setPlaying(false);
                }}
              >
                {commentMode ? "Click the video…" : "Comment"}
              </button>
            </div>
          )}
        </div>

        <div className={styles.right}>
          <div className={styles.tabs} role="tablist">
            {TABS.map((tabDef) => (
              <button
                key={tabDef.key}
                type="button"
                role="tab"
                aria-selected={tab === tabDef.key}
                className={`${styles.tab} ${tab === tabDef.key ? styles.active : ""}`}
                onClick={() => setTab(tabDef.key)}
              >
                {tabDef.label}
                {tabDef.key === "comments" ? ` ${comments.length}` : ""}
              </button>
            ))}
          </div>
          <div className={styles.tabPanel}>
            {tab === "info" && (
              <div className={styles.infoPanel}>
                <div>
                  <div className={styles.infoHeading}>Steps to reproduce</div>
                  {steps.map((s) => (
                    <button
                      key={s.n}
                      type="button"
                      data-testid="step"
                      className={styles.step}
                      onClick={() => seek(s.t)}
                    >
                      <span className={styles.stepNumber}>{s.n}</span>
                      <span className={styles.stepText}>{s.text}</span>
                      <span className={styles.stepTime}>{formatTime(s.t)}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.detailsList}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Reporter</span>
                    <span className={styles.detailValue}>
                      {rewind.reporterName}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Created</span>
                    <span className={styles.detailValue}>
                      {rewind.createdAt.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Page URL</span>
                    <span className={styles.detailValue}>
                      <a href={rewind.url} target="_blank" rel="noreferrer">
                        {rewind.url}
                      </a>
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Type</span>
                    <span className={styles.detailValue}>{rewind.kind}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Duration</span>
                    <span className={styles.detailValue}>
                      {isVideo ? formatTime(duration) : "—"}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Status</span>
                    <span className={styles.detailValue}>
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {(tab === "events" || tab === "console" || tab === "network") && (
              <div className={styles.eventList}>
                {tabRows.map((e) => {
                  const eventIndex = events.findIndex((ev) => ev.id === e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      data-testid="event-row"
                      className={styles.eventRow}
                      style={{
                        background:
                          eventIndex === currentIndex
                            ? e.isError
                              ? "var(--rw-err-soft)"
                              : "var(--rw-soft)"
                            : "transparent",
                        opacity: e.t > t ? 0.45 : 1,
                      }}
                      onClick={() => seek(e.t)}
                    >
                      <span className={styles.eventTime}>
                        {formatTime(e.t)}
                      </span>
                      <span className={styles.eventTag}>
                        {EVENT_TAG[e.kind]}
                      </span>
                      <span className={styles.eventText}>{e.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {tab === "comments" && (
              <div className={styles.commentsPanel}>
                {comments.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    data-testid="comment-row"
                    className={styles.commentRow}
                    onClick={() => seek(c.t)}
                  >
                    <span
                      className={styles.commentAvatar}
                      style={{ background: personColor(c.author) }}
                    >
                      {initials(c.author)}
                    </span>
                    <span className={styles.commentBody}>
                      <span className={styles.commentHead}>
                        <b className={styles.commentAuthor}>{c.author}</b>
                        <span className={styles.commentTime}>
                          {formatTime(c.t)}
                        </span>
                      </span>
                      {c.text}
                    </span>
                  </button>
                ))}
                {isVideo && (
                  <button
                    type="button"
                    className={styles.commentCta}
                    onClick={() => setCommentMode(true)}
                  >
                    Click on the video to leave a comment
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`${styles.toast} ${toast.tone === "error" ? styles.error : ""}`}
          role="status"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

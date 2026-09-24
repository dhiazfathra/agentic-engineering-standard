import { useEffect, useMemo, useRef, useState } from "react";
import { browser } from "wxt/browser";
import type { Event as RewindEvent } from "@rewind/schema";
import { deleteDraft, getDraft, type Draft } from "../../lib/drafts";
import { encodeFrames, exportImage, remux } from "../../lib/media";
import { applyTheme } from "../../lib/theme";
import { trimEvents } from "../../lib/timeline";
import { defaultTitle, fileDraft, TITLE_MAX } from "../../lib/upload";
import { settings, updateSettings } from "../../lib/settings";
import styles from "./editor.module.css";

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

function parseId(): string {
  return new URLSearchParams(window.location.search).get("id") ?? "";
}

/** true once the draft has a playable/renderable media kind (video, incl. an encoded replay). */
function isVideoDraft(draft: Draft): boolean {
  return draft.kind === "video" || draft.kind === "replay";
}

export default function Editor() {
  const id = useRef(parseId()).current;
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(
    "loading",
  );
  const [draft, setDraft] = useState<Draft | undefined>();
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [drawing, setDrawing] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [needsReporterName, setNeedsReporterName] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [openInNewTab, setOpenInNewTab] = useState(true);
  const [appUrl, setAppUrl] = useState("");

  const imgRef = useRef<HTMLImageElement>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      const current = await settings.getValue();
      applyTheme(current.theme);
      setOpenInNewTab(current.openInNewTab);
      setAppUrl(current.appUrl);
      setNeedsReporterName(current.reporterName === "");
      setReporterName(current.reporterName);

      const loaded = await getDraft(id);
      if (cancelled) return;
      if (!loaded) {
        setStatus("missing");
        return;
      }

      let mediaBlob = loaded.blob;
      let seconds = loaded.durationSeconds ?? 0;
      if (loaded.kind === "replay" && !mediaBlob && loaded.frames) {
        const encoded = await encodeFrames(loaded.frames);
        mediaBlob = encoded.blob;
        seconds = encoded.durationSeconds;
      }
      if (cancelled) return;

      setDraft(loaded);
      // ponytail: screenshot/video drafts always carry a blob, and a replay
      // draft is encoded above, so `mediaBlob` is never empty here in practice.
      setMediaUrl(URL.createObjectURL(mediaBlob!));
      setDurationSeconds(seconds);
      setTrimStart(0);
      setTrimEnd(seconds);
      setStatus("ready");
    }

    void init();
    return () => {
      cancelled = true;
    };
    // `id` never changes after mount; this effect runs exactly once.
  }, []);

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);

  const trimmedEvents = useMemo<RewindEvent[]>(() => {
    if (!draft) return [];
    if (!isVideoDraft(draft)) return draft.events;
    return trimEvents(draft.events, trimStart, trimEnd);
  }, [draft, trimStart, trimEnd]);

  const attachedText = `Attached automatically: ${trimmedEvents.length} events · ${
    trimmedEvents.filter((e) => e.isError).length
  } errors · ${trimmedEvents.filter((e) => e.kind === "net").length} network requests`;

  function imageRect(): { x: number; y: number; scale: number } {
    // ponytail: only wired to the screenshot's pointer handlers, which render
    // alongside this <img>, so the ref is always attached by the time a
    // pointer event reaches here.
    const el = imgRef.current!;
    const rect = el.getBoundingClientRect();
    const scale = el.naturalWidth ? el.naturalWidth / rect.width : 1;
    return { x: rect.left, y: rect.top, scale };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    const { x, y, scale } = imageRect();
    const startX = (e.clientX - x) * scale;
    const startY = (e.clientY - y) * scale;
    dragOriginRef.current = { x: startX, y: startY };
    setDrawing({ x: startX, y: startY, width: 0, height: 0 });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const { x, y, scale } = imageRect();
    const curX = (e.clientX - x) * scale;
    const curY = (e.clientY - y) * scale;
    setDrawing({
      x: Math.min(origin.x, curX),
      y: Math.min(origin.y, curY),
      width: Math.abs(curX - origin.x),
      height: Math.abs(curY - origin.y),
    });
  }

  function onPointerUp(): void {
    dragOriginRef.current = null;
    setDrawing((current) => {
      if (current && (current.width > 2 || current.height > 2)) {
        setBoxes((bs) => [...bs, { ...current, label: "" }]);
      }
      return null;
    });
  }

  function undo(): void {
    setBoxes((bs) => bs.slice(0, -1));
  }

  function setBoxLabel(index: number, label: string): void {
    setBoxes((bs) => bs.map((b, i) => (i === index ? { ...b, label } : b)));
  }

  const MIN_TRIM_GAP = 0.5;

  function dragHandle(which: "start" | "end") {
    return function onDown(e: React.PointerEvent<HTMLDivElement>): void {
      e.preventDefault();
      const bar = e.currentTarget.parentElement as HTMLDivElement;
      function onMove(ev: PointerEvent): void {
        const rect = bar.getBoundingClientRect();
        const fraction = Math.min(
          1,
          Math.max(0, (ev.clientX - rect.left) / rect.width),
        );
        const seconds = fraction * durationSeconds;
        if (which === "start") {
          setTrimStart(Math.min(seconds, trimEnd - MIN_TRIM_GAP));
        } else {
          setTrimEnd(Math.max(seconds, trimStart + MIN_TRIM_GAP));
        }
      }
      function onUp(): void {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  async function discard(): Promise<void> {
    await deleteDraft(id);
    window.close();
  }

  function saveForLater(): void {
    window.close();
  }

  async function createLink(): Promise<void> {
    // Only reachable once `status === "ready"`, which sets `draft`.
    const currentDraft = draft!;
    if (needsReporterName && reporterName.trim() === "") {
      setError("Your name is required");
      return;
    }
    setError("");
    setWorking(true);
    try {
      let blob: Blob;
      let durationForUpload: number | undefined;
      let events: RewindEvent[];

      if (isVideoDraft(currentDraft)) {
        const source =
          currentDraft.kind === "replay" && mediaUrl
            ? await (await fetch(mediaUrl)).blob()
            : currentDraft.blob!;
        const remuxed = await remux(source, {
          start: trimStart,
          end: trimEnd,
        });
        blob = remuxed.blob;
        durationForUpload = remuxed.durationSeconds;
        events = trimEvents(currentDraft.events, trimStart, trimEnd);
      } else {
        const img = imgRef.current!;
        blob = await exportImage(img, boxes);
        events = currentDraft.events;
      }

      if (needsReporterName && reporterName.trim() !== "") {
        await updateSettings({ reporterName });
      }

      const kind = currentDraft.kind === "screenshot" ? "screenshot" : "video";
      const result = await fileDraft({
        appUrl,
        blob,
        contentType: kind === "screenshot" ? "image/png" : "video/webm",
        rewind: {
          title: title || defaultTitle(kind, currentDraft.url),
          url: currentDraft.url,
          reporterName,
          status: "new",
          kind,
          ...(kind === "video" ? { durationSeconds: durationForUpload } : {}),
          events,
        },
      });

      try {
        await navigator.clipboard.writeText(result.viewerUrl);
      } catch {
        // Clipboard permission may be denied; the link is still created.
      }

      await deleteDraft(id);

      if (openInNewTab) {
        await browser.tabs.create({ url: result.viewerUrl });
        window.close();
      } else {
        location.assign(result.viewerUrl);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link");
      setWorking(false);
    }
  }

  if (status === "loading") return null;
  if (status === "missing") {
    return <div className={styles.missing}>This draft was not found.</div>;
  }

  const isVideo = isVideoDraft(draft!);
  const startPct = durationSeconds ? (trimStart / durationSeconds) * 100 : 0;
  const endPct = durationSeconds ? (trimEnd / durationSeconds) * 100 : 100;

  return (
    <div className={styles.page}>
      <div className={styles.modal}>
        <div className={styles.left}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => void (isVideo ? saveForLater() : discard())}
          >
            {isVideo ? "Save for later" : "Discard"}
          </button>

          <div className={styles.stage}>
            {!isVideo && (
              <div
                className={styles.imageWrap}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <img
                  ref={imgRef}
                  src={mediaUrl}
                  alt="Screenshot"
                  className={styles.image}
                  draggable={false}
                />
                {[
                  ...boxes,
                  ...(drawing ? [{ ...drawing, label: "" }] : []),
                ].map((box, i) => (
                  <div
                    key={i}
                    className={styles.box}
                    style={{
                      left: box.x / imageRect().scale,
                      top: box.y / imageRect().scale,
                      width: box.width / imageRect().scale,
                      height: box.height / imageRect().scale,
                    }}
                  />
                ))}
              </div>
            )}

            {isVideo && (
              <video src={mediaUrl} className={styles.video} controls muted />
            )}
          </div>

          {!isVideo && (
            <div className={styles.boxTools}>
              {boxes.map((box, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder="Label (optional)"
                  className={styles.labelInput}
                  value={box.label}
                  onChange={(e) => setBoxLabel(i, e.target.value)}
                />
              ))}
              {boxes.length > 0 && (
                <button
                  type="button"
                  className={styles.undoButton}
                  onClick={undo}
                >
                  Undo
                </button>
              )}
            </div>
          )}

          {isVideo && (
            <div className={styles.trimBar}>
              <div
                className={styles.handle}
                style={{ left: `${startPct}%` }}
                role="slider"
                aria-label="Trim start"
                aria-valuemin={0}
                aria-valuemax={durationSeconds}
                aria-valuenow={trimStart}
                onPointerDown={dragHandle("start")}
              />
              <div
                className={styles.trimRange}
                style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
              />
              <div
                className={styles.handle}
                style={{ left: `${endPct}%` }}
                role="slider"
                aria-label="Trim end"
                aria-valuemin={0}
                aria-valuemax={durationSeconds}
                aria-valuenow={trimEnd}
                onPointerDown={dragHandle("end")}
              />
            </div>
          )}

          <div className={styles.durationLabel}>
            {isVideo
              ? `${Math.round(trimEnd - trimStart)} second${
                  Math.round(trimEnd - trimStart) === 1 ? "" : "s"
                }`
              : "Screenshot"}
          </div>
        </div>

        <div className={styles.right}>
          <input
            type="text"
            className={styles.titleInput}
            placeholder={defaultTitle(
              draft!.kind === "screenshot" ? "screenshot" : "video",
              draft!.url,
            )}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
          />

          {needsReporterName && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="rw-editor-name">
                Your name
              </label>
              <input
                id="rw-editor-name"
                type="text"
                className={styles.textInput}
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
              />
            </div>
          )}

          <div className={styles.attached}>{attachedText}</div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="button"
            className={styles.cta}
            disabled={working}
            onClick={() => void createLink()}
          >
            {working ? "Uploading…" : "Create link"}
          </button>
        </div>
      </div>
    </div>
  );
}

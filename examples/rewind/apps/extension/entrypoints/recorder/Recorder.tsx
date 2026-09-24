import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { newId } from "@rewind/schema";
import { putDraft } from "../../lib/drafts";
import {
  cropTrack,
  openDisplayStream,
  openMic,
  openTabStream,
  startRecorder,
  type Recorder as MediaRecorderHandle,
} from "../../lib/media";
import { send } from "../../lib/messages";
import { settings } from "../../lib/settings";
import { spanSeconds, type Span } from "../../lib/timeline";
import { applyTheme } from "../../lib/theme";
import styles from "./recorder.module.css";

type Phase =
  | "starting"
  | "desktop-picker"
  | "desktop-cancelled"
  | "countdown"
  | "recording";

type MicState = "off" | "on" | "unavailable";

const COUNTDOWN_START = 3;
const COUNTDOWN_TICK_MS = 1000;
const TIMER_TICK_MS = 250;

function parseParams(): { tabId: number; mode: string; streamId: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    tabId: Number(params.get("tab")),
    mode: params.get("mode") ?? "tab",
    streamId: params.get("stream") ?? "",
  };
}

function formatElapsed(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

export default function Recorder() {
  const [phase, setPhase] = useState<Phase>("starting");
  const [micState, setMicState] = useState<MicState>("off");
  const [micMuted, setMicMuted] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const { tabId, mode, streamId } = useRef(parseParams()).current;
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const recorderRef = useRef<MediaRecorderHandle | null>(null);
  const spansRef = useRef<Span[]>([]);
  const openStartRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);

  function closeOpenSpan(): void {
    if (openStartRef.current === null) return;
    spansRef.current.push({ start: openStartRef.current, end: Date.now() });
    openStartRef.current = null;
  }

  function stopTracks(): void {
    videoTrackRef.current?.stop();
    micTrackRef.current?.stop();
  }

  async function discard(): Promise<void> {
    closeOpenSpan();
    recorderRef.current?.stop().catch(() => undefined);
    stopTracks();
    await send({ type: "recording", tabId, since: null });
    window.close();
  }

  async function stop(): Promise<void> {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    closeOpenSpan();
    const recorder = recorderRef.current;
    const blob = recorder ? await recorder.stop() : new Blob();
    stopTracks();

    const spans = spansRef.current;
    const events = await send<import("@rewind/schema").Event[]>({
      type: "events",
      tabId,
      spans,
    });
    await send({ type: "recording", tabId, since: null });

    const tab = await browser.tabs.get(tabId);
    const id = newId();
    await putDraft({
      id,
      createdAt: Date.now(),
      url: tab.url ?? "",
      kind: "video",
      blob,
      durationSeconds: spanSeconds(spans),
      events,
    });

    await browser.tabs.create({
      url: browser.runtime.getURL(`/editor.html?id=${id}`),
    });
    window.close();
  }

  function startCountdownAndRecord(video: MediaStreamTrack): void {
    videoTrackRef.current = video;
    video.addEventListener("ended", () => void stop());
    setPhase("countdown");
  }

  async function afterVideoTrack(video: MediaStreamTrack): Promise<void> {
    const current = await settings.getValue();
    if (current.micOn) {
      try {
        const micStream = await openMic(current.micDeviceId);
        const micTrack = micStream.getAudioTracks()[0] ?? null;
        micTrackRef.current = micTrack;
        setMicState("on");
      } catch {
        setMicState("unavailable");
      }
    }
    startCountdownAndRecord(video);
  }

  async function startDesktop(): Promise<void> {
    try {
      const stream = await openDisplayStream();
      const video = stream.getVideoTracks()[0]!;
      await afterVideoTrack(video);
    } catch {
      setPhase("desktop-cancelled");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      const current = await settings.getValue();
      applyTheme(current.theme);

      if (mode === "desktop") {
        setPhase("desktop-picker");
        return;
      }

      const stream = await openTabStream(streamId);
      let video = stream.getVideoTracks()[0]!;

      if (mode === "area") {
        const rect = await send<import("../../lib/messages").Rect | null>({
          type: "area",
          tabId,
        });
        if (cancelled) return;
        if (rect === null) {
          window.close();
          return;
        }
        video = cropTrack(video, rect);
      }

      if (!cancelled) await afterVideoTrack(video);
    }

    void init();
    return () => {
      cancelled = true;
    };
    // Params never change after mount; this effect runs exactly once.
  }, []);

  // Countdown ticking.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownPaused) return;
    if (countdown <= 0) {
      const stream = new MediaStream(
        [videoTrackRef.current, micTrackRef.current].filter(
          (t): t is MediaStreamTrack => t !== null,
        ),
      );
      recorderRef.current = startRecorder(stream);
      openStartRef.current = Date.now();
      void send({ type: "recording", tabId, since: Date.now() });
      setPhase("recording");
      return;
    }
    const timer = setTimeout(
      () => setCountdown((c) => c - 1),
      COUNTDOWN_TICK_MS,
    );
    return () => clearTimeout(timer);
  }, [phase, countdown, countdownPaused, tabId]);

  // Elapsed timer while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      const openSeconds =
        openStartRef.current === null
          ? 0
          : (Date.now() - openStartRef.current) / 1000;
      setElapsed(spanSeconds(spansRef.current) + openSeconds);
    }, TIMER_TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  function togglePause(): void {
    if (recordingPaused) {
      recorderRef.current?.resume();
      openStartRef.current = Date.now();
      setRecordingPaused(false);
    } else {
      recorderRef.current?.pause();
      closeOpenSpan();
      setRecordingPaused(true);
    }
  }

  function toggleMic(): void {
    const track = micTrackRef.current;
    // Defensive: the mic button is disabled whenever there's no track, so a
    // real click can never reach here with `track` null.
    /* v8 ignore next */
    if (!track) return;
    track.enabled = micMuted;
    setMicMuted((m) => !m);
  }

  if (phase === "starting") return null;

  if (phase === "desktop-picker") {
    return (
      <div className={styles.picker}>
        <button
          className={styles.pickerButton}
          onClick={() => void startDesktop()}
        >
          Choose what to record
        </button>
      </div>
    );
  }

  if (phase === "desktop-cancelled") {
    return (
      <div className={styles.picker}>
        <p>Nothing to record</p>
        <button
          className={styles.pickerButton}
          onClick={() => void startDesktop()}
        >
          Choose what to record
        </button>
      </div>
    );
  }

  const micLabel = micState === "on" && !micMuted ? "ON" : "OFF";
  const micColor = micState === "on" && !micMuted ? "#5fe0dc" : "#ff8a9a";

  return (
    <div className={styles.stage}>
      {phase === "countdown" && (
        <button
          type="button"
          className={styles.countdownPanel}
          onClick={() => setCountdownPaused((p) => !p)}
          aria-label="Pause the countdown"
        >
          <div className={styles.countdownCard}>
            <div className={styles.countdownTitle}>Preparing to record</div>
            <div className={styles.countdownMic}>
              Your microphone is{" "}
              <span style={{ color: micColor, fontWeight: 600 }}>
                {micLabel}
              </span>
              .
            </div>
            <div className={styles.countdownHint}>
              Click anywhere to pause the countdown
            </div>
          </div>
        </button>
      )}

      {micState === "unavailable" && (
        <div className={styles.micNoteBar}>Microphone unavailable</div>
      )}

      <div className={styles.bar}>
        <button
          className={styles.barButton}
          title="Stop"
          aria-label="Stop"
          onClick={() => void stop()}
        >
          <div className={styles.stopDot} />
        </button>

        {phase === "countdown" && (
          <span className={styles.countLabel}>Recording in {countdown}</span>
        )}

        {phase === "recording" && (
          <span className={styles.timeLabel}>
            <span
              className={styles.pulseDot}
              style={{ background: recordingPaused ? "#99a1af" : "#e35e5e" }}
            />
            {formatElapsed(elapsed)}
          </span>
        )}

        {phase === "recording" && (
          <button
            className={styles.barButton}
            title={recordingPaused ? "Resume" : "Pause"}
            aria-label={recordingPaused ? "Resume" : "Pause"}
            onClick={togglePause}
          >
            {recordingPaused ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M7 4l13 8-13 8z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
            )}
          </button>
        )}

        <button
          className={styles.barButton}
          title="Microphone"
          aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
          disabled={micState !== "on"}
          onClick={toggleMic}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>

        <div className={styles.divider} />

        <button
          className={styles.barButton}
          title="Discard"
          aria-label="Discard"
          onClick={() => void discard()}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </div>
    </div>
  );
}

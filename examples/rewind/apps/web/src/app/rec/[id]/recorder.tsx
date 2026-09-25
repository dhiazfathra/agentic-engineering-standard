"use client";

import { useRef, useState } from "react";
import styles from "./recorder.module.css";

type Status = "idle" | "recording" | "uploading" | "error" | "done";

type Props = { linkId: string; linkName: string };

/**
 * Public screen recorder for `/rec/[id]`: video only, no console/network
 * instrumentation (this page isn't injected into any site), so it uploads
 * straight through `/api/uploads` then files the Rewind with no events.
 */
export function Recorder({ linkId, linkName }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  async function upload(blob: Blob, durationSeconds: number) {
    setStatus("uploading");
    try {
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "video/webm" }),
      });
      if (!uploadRes.ok) throw new Error("upload url failed");
      const { url, key } = (await uploadRes.json()) as {
        url: string;
        key: string;
      };

      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "video/webm" },
        body: blob,
      });
      if (!putRes.ok) throw new Error("upload failed");

      const rewindRes = await fetch(`/api/rec/${linkId}/rewinds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaKey: key, durationSeconds }),
      });
      if (!rewindRes.ok) throw new Error("save failed");

      setStatus("done");
    } catch {
      setError("Upload failed. Check your connection and try again.");
      setStatus("error");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const durationSeconds = Math.max(
          0.1,
          (Date.now() - startedAtRef.current) / 1000,
        );
        void upload(blob, durationSeconds);
      };
      // The browser's own "Stop sharing" control ends the track directly.
      stream.getVideoTracks()[0]!.onended = () => stopRecording();
      recorder.start();
      setStatus("recording");
    } catch {
      setError("Screen recording permission was denied.");
      setStatus("error");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.preview} aria-hidden="true">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--rw-accent-ink)"
            strokeWidth="1.8"
          >
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>

        {status === "done" ? (
          <>
            <h1 className={styles.title}>Thanks!</h1>
            <p className={styles.body}>
              Your recording was sent to {linkName}.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Ready to record?</h1>
            <p className={styles.body}>
              We&apos;ll capture your screen. Nothing is sent until you stop.
            </p>
          </>
        )}

        {status === "error" && <div className={styles.error}>{error}</div>}

        {status === "idle" || status === "error" ? (
          <button
            type="button"
            className={status === "error" ? styles.retry : styles.action}
            onClick={startRecording}
          >
            {status === "error" ? "Retry" : "Start recording"}
          </button>
        ) : null}

        {status === "recording" && (
          <button type="button" className={styles.stop} onClick={stopRecording}>
            Stop recording
          </button>
        )}

        {status === "uploading" && (
          <button type="button" className={styles.action} disabled>
            …
          </button>
        )}
      </div>
    </div>
  );
}

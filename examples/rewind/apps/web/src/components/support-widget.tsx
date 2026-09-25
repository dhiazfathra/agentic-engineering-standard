"use client";

import { useEffect, useState } from "react";
import styles from "./support-widget.module.css";

export type SupportView = "home" | "messages" | "status";

type Message = { id: string; text: string; reply?: string };

const STATUS_URL_LABEL = "All systems operational";

/**
 * SUPPORT_WIDGET-flagged in-app help panel (SPEC-design-parity.md §
 * Screens): Home / Messages (a canned "Rewind support" thread) / System
 * status. Backed by the real `/api/support/messages` route; status is a
 * static "operational" line — no real status page exists to check.
 */
export function SupportWidget({
  initialView,
  onClose,
}: {
  initialView: SupportView;
  onClose: () => void;
}) {
  const [view, setView] = useState<SupportView>(initialView);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (view !== "messages") return;
    let cancelled = false;
    fetch("/api/support/messages")
      .then((res) => (res.ok ? (res.json() as Promise<Message[]>) : []))
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view]);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("failed");
      const row = (await res.json()) as Message;
      setMessages((m) => [...m, row]);
      setDraft("");
    } catch {
      // ponytail: no retry/error toast here — the composer stays filled
      // so the person can just hit send again.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.panel} role="dialog" aria-label="Support">
      <div className={styles.head}>
        {view !== "home" && (
          <button
            type="button"
            className={styles.back}
            aria-label="Back"
            onClick={() => setView("home")}
          >
            ←
          </button>
        )}
        <span>
          {view === "home"
            ? "Rewind support"
            : view === "messages"
              ? "Messages"
              : "System status"}
        </span>
        <button
          type="button"
          className={styles.close}
          aria-label="Close support"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className={styles.body}>
        {view === "home" && (
          <>
            <button
              type="button"
              className={styles.homeItem}
              onClick={() => setView("messages")}
            >
              Messages ›
            </button>
            <button
              type="button"
              className={styles.homeItem}
              onClick={() => setView("status")}
            >
              System status ›
            </button>
          </>
        )}
        {view === "messages" &&
          messages.map((m) => (
            <div key={m.id}>
              <div className={`${styles.message} ${styles.messageMine}`}>
                {m.text}
              </div>
              {m.reply && (
                <div className={`${styles.message} ${styles.messageReply}`}>
                  {m.reply}
                </div>
              )}
            </div>
          ))}
        {view === "status" && <div>{STATUS_URL_LABEL}</div>}
      </div>
      {view === "messages" && (
        <div className={styles.composer}>
          <input
            aria-label="Message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !sending && send()}
            placeholder="Describe the issue..."
          />
          <button
            type="button"
            className={styles.send}
            disabled={sending}
            onClick={send}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

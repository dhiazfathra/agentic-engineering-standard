"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./toast.module.css";

export type ToastTone = "ok" | "error";

type PlainToast = { id: string; kind: "plain"; text: string; tone: ToastTone };
type ActionToast = {
  id: string;
  kind: "action";
  text: string;
  onUndo: () => void;
  onClose: () => void;
};
export type ToastItem = PlainToast | ActionToast;

let nextId = 0;

/**
 * Plain toasts ("Link copied", errors) clear themselves after 3s. Action
 * toasts (a delete) carry Undo and `×` and never clear on their own; each
 * stacks and closes independently, as `SPEC-library.md` requires.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (text: string, tone: ToastTone = "ok") => {
      const id = `t${nextId++}`;
      setToasts((prev) => [...prev, { id, kind: "plain", text, tone }]);
      timers.current.set(
        id,
        setTimeout(() => remove(id), 3000),
      );
      return id;
    },
    [remove],
  );

  const showActionToast = useCallback(
    (text: string, actions: { onUndo: () => void; onClose: () => void }) => {
      const id = `t${nextId++}`;
      setToasts((prev) => [...prev, { id, kind: "action", text, ...actions }]);
      return id;
    },
    [],
  );

  // Only the action-toast buttons in `ToastStack` call these, so the id
  // they pass always names an action toast.
  const undo = useCallback(
    (id: string) => {
      (toasts.find((t) => t.id === id) as ActionToast).onUndo();
      remove(id);
    },
    [toasts, remove],
  );

  const close = useCallback(
    (id: string) => {
      (toasts.find((t) => t.id === id) as ActionToast).onClose();
      remove(id);
    },
    [toasts, remove],
  );

  return { toasts, showToast, showActionToast, undo, close };
}

type Props = {
  toasts: ToastItem[];
  onUndo: (id: string) => void;
  onClose: (id: string) => void;
};

export function ToastStack({ toasts, onUndo, onClose }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.stack}>
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`${styles.toast} ${t.kind === "plain" && t.tone === "error" ? styles.error : ""}`}
        >
          {t.text}
          {t.kind === "action" && (
            <>
              <button
                type="button"
                className={styles.action}
                onClick={() => onUndo(t.id)}
              >
                Undo
              </button>
              <button
                type="button"
                className={styles.close}
                aria-label="Close"
                onClick={() => onClose(t.id)}
              >
                ×
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

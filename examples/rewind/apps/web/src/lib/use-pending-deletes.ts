"use client";

import { useCallback, useEffect, useRef } from "react";

type Pending = { url: string; restore: () => void; failText: string };

let nextKey = 0;

/**
 * Deferred deletes, shared by Rewinds and folders. `add` holds a `DELETE`
 * until `send` (the toast's `×`) or `undo`; nothing ever sends on a timer.
 * Leaving the page (`pagehide`, or the caller unmounting on a client
 * navigation) sends every pending request with `keepalive`. A failed
 * request runs `restore` and reports `failText` through `onFailed`.
 */
export function usePendingDeletes(onFailed: (text: string) => void) {
  const pending = useRef(new Map<string, Pending>());
  const onFailedRef = useRef(onFailed);
  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  const send = useCallback((key: string, keepalive = false) => {
    const p = pending.current.get(key);
    if (!p) return;
    pending.current.delete(key);
    fetch(
      p.url,
      keepalive ? { method: "DELETE", keepalive } : { method: "DELETE" },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`DELETE ${res.status}`);
      })
      .catch(() => {
        p.restore();
        onFailedRef.current(p.failText);
      });
  }, []);

  const add = useCallback((entry: Pending) => {
    const key = `d${nextKey++}`;
    pending.current.set(key, entry);
    return key;
  }, []);

  const undo = useCallback((key: string) => {
    pending.current.get(key)?.restore();
    pending.current.delete(key);
  }, []);

  useEffect(() => {
    const flush = () => {
      for (const key of [...pending.current.keys()]) send(key, true);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [send]);

  return { add, send, undo };
}

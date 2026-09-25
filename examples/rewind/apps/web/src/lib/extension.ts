"use client";

/**
 * "New Rewind" (SPEC-design-parity.md § Ambiguities): the web app cannot
 * open the extension's popup directly, so it posts a ping on `window` and
 * waits for the extension's content script to answer on the same channel.
 * No listener ships yet in `apps/extension` (that is separate work), so
 * this always falls through to the "not installed" case today; the
 * mechanism is real and picks up automatically once one does.
 */
const PING_TYPE = "rewind-extension-ping";
const PONG_TYPE = "rewind-extension-pong";
const PING_TIMEOUT_MS = 300;

export function pingExtension(
  timeoutMs: number = PING_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === PONG_TYPE) {
        cleanup(true);
      }
    };
    const cleanup = (found: boolean) => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(found);
    };
    const timer = setTimeout(() => cleanup(false), timeoutMs);
    window.addEventListener("message", onMessage);
    window.postMessage({ type: PING_TYPE }, window.location.origin);
  });
}

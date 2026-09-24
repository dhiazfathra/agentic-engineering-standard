// Runs in the page's MAIN world so it can wrap the page's own globals. It
// never has extension APIs, so every captured event is relayed to
// `capture.content.ts` (ISOLATED world) with `window.postMessage`.
import { event, formatArgs, formatRequest, navText } from "../lib/events";
import type { CapturedEvent } from "../lib/messages";

type Win = typeof window;
type Send = (e: CapturedEvent) => void;

// document_start doesn't guarantee this (MAIN) script runs before or after
// the ISOLATED script attaches its `message` listener. Queue events until
// ISOLATED confirms it's ready, then flush; a hello/ready handshake covers
// either load order.
const QUEUE_CAP = 1000;

function post(win: Win, e: CapturedEvent): void {
  win.postMessage({ source: "rewind", event: e }, win.location.origin);
}

/** Queues events posted before ISOLATED is confirmed ready, then flushes once it is. */
export function makeSend(win: Win): Send {
  let ready = false;
  const queue: CapturedEvent[] = [];

  win.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== win) return;
    const data = e.data as { source?: string; ready?: boolean } | undefined;
    if (data?.source !== "rewind" || !data.ready) return;
    if (ready) return;
    ready = true;
    for (const queued of queue) post(win, queued);
    queue.length = 0;
  });
  win.postMessage({ source: "rewind", hello: true }, win.location.origin);

  return (e) => {
    if (ready) {
      post(win, e);
      return;
    }
    queue.push(e);
    if (queue.length > QUEUE_CAP) queue.shift();
  };
}

/** Wraps `console.log/info/debug` (log), `console.warn` (warn), `console.error` (err). */
export function installConsole(win: Win, send: Send): void {
  const methods: [keyof Console & string, CapturedEvent["kind"]][] = [
    ["log", "log"],
    ["info", "log"],
    ["debug", "log"],
    ["warn", "warn"],
    ["error", "err"],
  ];
  for (const [method, kind] of methods) {
    const original = (win.console[method] as (...a: unknown[]) => void).bind(
      win.console,
    );
    (win.console as unknown as Record<string, unknown>)[method] = (
      ...args: unknown[]
    ) => {
      try {
        send(event(kind, formatArgs(args), kind === "err"));
      } catch {
        // never let capture break the page's console call
      }
      return original(...args);
    };
  }
}

/** Wraps `window` `error` and `unhandledrejection`: both report `err`, `isError: true`. */
export function installErrors(win: Win, send: Send): void {
  win.addEventListener("error", (e: ErrorEvent) => {
    try {
      send(
        event(
          "err",
          e.error instanceof Error ? e.error.message : e.message,
          true,
        ),
      );
    } catch {
      // never let capture break the page
    }
  });
  win.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    try {
      const { reason } = e;
      const text =
        reason instanceof Error ? reason.message : formatArgs([reason]);
      send(event("err", text, true));
    } catch {
      // never let capture break the page
    }
  });
}

function requestUrl(win: Win, input: RequestInfo | URL): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(raw, win.location.href).href;
}

function requestMethod(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): string {
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

/** Wraps `fetch` and `XMLHttpRequest`: reports `net`, `isError` on status >= 400 or a failure. */
export function installNetwork(win: Win, send: Send): void {
  const pageOrigin = win.location.origin;
  const originalFetch = win.fetch.bind(win);

  win.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(win, input);
    const method = requestMethod(input, init);
    const start = performance.now();
    try {
      const res = await originalFetch(input, init);
      try {
        send(
          event(
            "net",
            formatRequest(
              method,
              url,
              res.status,
              performance.now() - start,
              pageOrigin,
            ),
            res.status >= 400,
          ),
        );
      } catch {
        // never let capture break the page's fetch call
      }
      return res;
    } catch (err) {
      try {
        send(
          event(
            "net",
            formatRequest(
              method,
              url,
              null,
              performance.now() - start,
              pageOrigin,
            ),
            true,
          ),
        );
      } catch {
        // never let capture break the page's fetch call
      }
      throw err; // rethrow the page's own error
    }
  }) as typeof win.fetch;

  const OriginalXHR = win.XMLHttpRequest;

  class CaptureXHR extends OriginalXHR {
    private rwMethod = "GET";
    private rwUrl = "";
    private rwStart = 0;

    override open(method: string, url: string | URL, ...rest: unknown[]): void {
      this.rwMethod = method.toUpperCase();
      this.rwUrl = requestUrl(win, url instanceof URL ? url : String(url));
      const args = [method, url, ...rest] as Parameters<XMLHttpRequest["open"]>;
      super.open(...args);
    }

    override send(...args: unknown[]): void {
      this.rwStart = performance.now();
      this.addEventListener("loadend", () => {
        try {
          const ms = performance.now() - this.rwStart;
          const failed = this.status === 0;
          send(
            event(
              "net",
              formatRequest(
                this.rwMethod,
                this.rwUrl,
                failed ? null : this.status,
                ms,
                pageOrigin,
              ),
              failed || this.status >= 400,
            ),
          );
        } catch {
          // never let capture break the page's XHR call
        }
      });
      super.send(...(args as Parameters<XMLHttpRequest["send"]>));
    }
  }

  win.XMLHttpRequest = CaptureXHR;
}

/** Wraps `history.pushState`/`replaceState` and `popstate`: reports `nav`. */
export function installHistory(win: Win, send: Send): void {
  const wrap = (name: "pushState" | "replaceState") => {
    const original = win.history[name].bind(win.history);
    win.history[name] = (...args: Parameters<History["pushState"]>) => {
      const result = original(...args);
      try {
        send(event("nav", navText(win.location.href)));
      } catch {
        // never let capture break the page's navigation
      }
      return result;
    };
  };
  wrap("pushState");
  wrap("replaceState");
  win.addEventListener("popstate", () => {
    try {
      send(event("nav", navText(win.location.href)));
    } catch {
      // never let capture break the page's navigation
    }
  });
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const send: Send = makeSend(window);
    installConsole(window, send);
    installErrors(window, send);
    installNetwork(window, send);
    installHistory(window, send);
  },
});

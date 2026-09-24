// Runs in the ISOLATED world: has extension APIs, so it relays every
// captured event (its own and the MAIN world's) to the background, and
// answers the background's area-selection request.
import { browser } from "wxt/browser";
import {
  clickText,
  event,
  inputText,
  isFormField,
  navText,
} from "../lib/events";
import { send } from "../lib/messages";
import type { CapturedEvent, Message, Rect } from "../lib/messages";
import { settings } from "../lib/settings";

const MIN_SIZE = 10;

/**
 * Relays a MAIN-world event posted with `window.postMessage`. Split out so
 * tests can call it directly with an exact `source`, since `postMessage`'s
 * async delivery in a test DOM does not reliably preserve identity.
 */
export function forwardMainEvent(
  e: MessageEvent,
  win: Window,
  captureUserEvents: () => boolean,
  onEvent: (captured: CapturedEvent) => void,
): void {
  if (e.source !== win) return;
  const data = e.data as { source?: string; event?: CapturedEvent } | undefined;
  if (data?.source !== "rewind" || !data.event) return;
  // MAIN world's `nav` events (pushState/replaceState/popstate) are a user
  // navigation, same as clicks and input, so they honor the same setting.
  if (data.event.kind === "nav" && !captureUserEvents()) return;
  onEvent(data.event);
}

/**
 * Handshake with MAIN world's `capture-main.content.ts`: whichever of the two
 * document_start scripts loads first, the other replies `ready` so MAIN can
 * flush events it queued before ISOLATED's listener existed.
 */
export function announceReady(win: Window): void {
  win.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== win) return;
    const data = e.data as { source?: string; hello?: boolean } | undefined;
    if (data?.source !== "rewind" || !data.hello) return;
    win.postMessage({ source: "rewind", ready: true }, win.location.origin);
  });
  win.postMessage({ source: "rewind", ready: true }, win.location.origin);
}

/** Draws a drag-to-select overlay in a shadow root; Escape cancels, mouseup/Enter confirms. */
export function selectArea(doc: Document): Promise<Rect | null> {
  return new Promise((resolve) => {
    const host = doc.createElement("div");
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;";
    doc.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "closed" });

    const dim = doc.createElement("div");
    dim.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,.3);";
    const box = doc.createElement("div");
    box.style.cssText =
      "position:absolute;display:none;border:2px solid #e11;background:rgba(225,17,17,.15);";
    root.append(dim, box);

    let startX = 0;
    let startY = 0;
    let rect: Rect | null = null;

    function finish(result: Rect | null): void {
      doc.removeEventListener("keydown", onKeyDown, true);
      host.remove();
      resolve(result);
    }

    function updateBox(x: number, y: number): void {
      const left = Math.min(startX, x);
      const top = Math.min(startY, y);
      const width = Math.abs(x - startX);
      const height = Math.abs(y - startY);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      rect =
        width < MIN_SIZE || height < MIN_SIZE
          ? null
          : {
              x: left,
              y: top,
              width,
              height,
              viewportWidth: doc.defaultView!.innerWidth,
            };
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") finish(null);
      else if (e.key === "Enter") finish(rect);
    }

    function onMouseDown(e: MouseEvent): void {
      startX = e.clientX;
      startY = e.clientY;
      box.style.display = "block";
      updateBox(e.clientX, e.clientY);
    }

    function onMouseMove(e: MouseEvent): void {
      if (box.style.display !== "block") return;
      updateBox(e.clientX, e.clientY);
    }

    function onMouseUp(): void {
      finish(rect);
    }

    host.addEventListener("mousedown", onMouseDown);
    host.addEventListener("mousemove", onMouseMove);
    host.addEventListener("mouseup", onMouseUp);
    doc.addEventListener("keydown", onKeyDown, true);
  });
}

/** Split out so the on/off branch is directly testable without a full `main()` instance. */
export function maybeSendInitialNav(
  captureUserEvents: boolean,
  onSend: () => void,
): void {
  if (captureUserEvents) onSend();
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  world: "ISOLATED",
  runAt: "document_start",
  main() {
    let captureUserEvents = true;

    void settings.getValue().then((s) => {
      captureUserEvents = s.captureUserEvents;
      maybeSendInitialNav(captureUserEvents, () => {
        void send({
          type: "event",
          event: event("nav", navText(location.href)),
        });
      });
    });
    settings.watch((next) => {
      captureUserEvents = next.captureUserEvents;
    });

    window.addEventListener("message", (e) => {
      forwardMainEvent(
        e,
        window,
        () => captureUserEvents,
        (capturedEvent) => {
          void send({ type: "event", event: capturedEvent });
        },
      );
    });
    announceReady(window);

    document.addEventListener(
      "click",
      (e) => {
        if (!captureUserEvents) return;
        const target = e.target as Element;
        void send({ type: "event", event: event("click", clickText(target)) });
      },
      true,
    );

    document.addEventListener("change", (e) => {
      if (!captureUserEvents) return;
      const target = e.target as Element;
      if (!isFormField(target)) return;
      void send({ type: "event", event: event("input", inputText(target)) });
    });

    browser.runtime.onMessage.addListener((message: Message) => {
      if (message.type !== "select-area") return undefined;
      return selectArea(document);
    });
  },
});

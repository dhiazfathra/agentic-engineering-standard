import { newId } from "@rewind/schema";
import { browser } from "wxt/browser";
import { REPLAY_MS } from "../buffer";
import { putDraft, putSnapshot, pruneSnapshots, snapshotsFor } from "../drafts";
import type { Span } from "../timeline";
import * as buffer from "./buffer";

const TICK_MS = 1000;
const JPEG_QUALITY = 60;

let timer: ReturnType<typeof setInterval> | undefined;

/** Whether the replay capture loop is running. */
export function isRunning(): boolean {
  return timer !== undefined;
}

async function tick(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (
      tab?.id == null ||
      tab.windowId == null ||
      !tab.url?.startsWith("http")
    ) {
      return;
    }
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: JPEG_QUALITY,
    });
    const blob = await (await fetch(dataUrl)).blob();
    const now = Date.now();
    await putSnapshot({ tabId: tab.id, at: now, blob });
    await pruneSnapshots(now - REPLAY_MS);
  } catch {
    // A tab that cannot be captured (e.g. a browser page) is skipped, not fatal.
  }
}

/** Starts the 1s capture loop, if it is not already running. */
export function start(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), TICK_MS);
}

/** Stops the capture loop. */
export function stop(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}

/** Builds a `replay` draft from a tab's snapshots, or `{ error }` when there are none. */
export async function save(
  tabId: number,
): Promise<{ id: string } | { error: string }> {
  const snapshots = await snapshotsFor(tabId, 0);
  if (snapshots.length === 0) return { error: "No replay yet" };

  const first = snapshots[0]!.at;
  const last = snapshots[snapshots.length - 1]!.at;
  const span: Span = { start: first, end: last + 1000 };

  const tab = await browser.tabs.get(tabId);
  const events = await buffer.eventsFor(tabId, [span]);
  const id = newId();
  await putDraft({
    id,
    createdAt: Date.now(),
    url: tab.url ?? "",
    kind: "replay",
    frames: snapshots.map((s) => ({ at: s.at, blob: s.blob })),
    events,
  });
  await browser.tabs.create({
    // `editor.html` is added by T7; cast until WXT's `PublicPath` union knows it.
    url: browser.runtime.getURL(`/editor.html?id=${id}` as never),
  });
  return { id };
}

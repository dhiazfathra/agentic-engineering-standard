import { newId } from "@rewind/schema";
import { browser, type Browser } from "wxt/browser";
import { REPLAY_MS } from "../buffer";
import { putDraft } from "../drafts";
import type { Delay } from "../settings";
import { toRewindEvents } from "../timeline";
import * as buffer from "./buffer";

const DELAY_MS: Record<Delay, number> = { off: 0, "3s": 3000, "6s": 6000 };

function sleep(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

/** Captures `windowId`, rejecting unless `tabId` is still the tab it shows. */
export async function captureTab(
  tabId: number,
  windowId: number,
  options: Browser.extensionTypes.ImageDetails,
): Promise<Blob> {
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, options);
  if (!(await browser.tabs.get(tabId)).active) {
    throw new Error("The tab is no longer visible");
  }
  return (await fetch(dataUrl)).blob();
}

/**
 * Waits `delay`, captures the target tab, saves a screenshot draft with its
 * last 2 minutes of events, and opens the editor. Returns the draft id.
 */
export async function takeScreenshot(
  tabId: number,
  delay: Delay,
): Promise<string> {
  await sleep(DELAY_MS[delay]);

  const tab = await browser.tabs.get(tabId);
  if (!tab.url?.startsWith("http") || tab.windowId == null) {
    throw new Error("Cannot capture a non-http(s) tab");
  }

  const blob = await captureTab(tabId, tab.windowId, { format: "png" });

  const now = Date.now();
  const raw = await buffer.raw(tabId);
  const start = raw.length
    ? Math.max(raw[0]!.at, now - REPLAY_MS)
    : now - REPLAY_MS;
  const events = toRewindEvents(raw, [{ start, end: now }]);

  const id = newId();
  await putDraft({
    id,
    createdAt: now,
    url: tab.url,
    kind: "screenshot",
    blob,
    events,
  });

  await browser.tabs.create({
    url: browser.runtime.getURL(`/editor.html?id=${id}`),
  });

  return id;
}

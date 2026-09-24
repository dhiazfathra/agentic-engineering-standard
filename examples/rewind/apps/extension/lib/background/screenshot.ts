import { newId } from "@rewind/schema";
import { browser } from "wxt/browser";
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

  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  const blob = await (await fetch(dataUrl)).blob();

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
    // `editor.html` is added by T7; cast until WXT's `PublicPath` union knows it.
    url: browser.runtime.getURL(`/editor.html?id=${id}` as never),
  });

  return id;
}

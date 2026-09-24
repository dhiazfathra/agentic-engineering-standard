import { browser } from "wxt/browser";
import type { Rect, RecordMode } from "../messages";

/** Opens the recorder popup window for a tab. */
export async function openRecorder(
  tabId: number,
  mode: RecordMode,
  streamId?: string,
): Promise<void> {
  const params = new URLSearchParams({ tab: String(tabId), mode });
  if (streamId) params.set("stream", streamId);
  await browser.windows.create({
    type: "popup",
    // `recorder.html` is added by T6; WXT's generated `PublicPath` union
    // does not know it yet, so the path needs a cast until then.
    url: browser.runtime.getURL(`/recorder.html?${params.toString()}` as never),
    width: 420,
    height: 260,
  });
}

/** Focuses the tab, then asks its content script to let the user drag an area. */
export async function selectArea(tabId: number): Promise<Rect | null> {
  const tab = await browser.tabs.get(tabId);
  if (tab.windowId != null) {
    await browser.windows.update(tab.windowId, { focused: true });
  }
  await browser.tabs.update(tabId, { active: true });
  const result = await browser.tabs.sendMessage(tabId, { type: "select-area" });
  return (result as Rect | null) ?? null;
}

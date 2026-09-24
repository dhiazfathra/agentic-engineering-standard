import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { openRecorder, selectArea } from "../../lib/background/recorder";

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe("openRecorder", () => {
  it("opens a popup window with the tab and mode in the URL", async () => {
    const spy = vi
      .spyOn(browser.windows, "create")
      .mockResolvedValue({} as never);
    await openRecorder(7, "tab");
    expect(spy).toHaveBeenCalledWith({
      type: "popup",
      url: expect.stringContaining("recorder.html?tab=7&mode=tab"),
      width: 420,
      height: 260,
    });
  });

  it("includes the stream id when given", async () => {
    const spy = vi
      .spyOn(browser.windows, "create")
      .mockResolvedValue({} as never);
    await openRecorder(7, "area", "stream-1");
    expect(spy.mock.calls[0]![0]!.url!).toContain("stream=stream-1");
  });
});

describe("selectArea", () => {
  it("focuses the tab's window, activates it, and returns the content script's rect", async () => {
    await fakeBrowser.tabs.update(0, { url: "https://a.co/x" });
    const sendSpy = vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      viewportWidth: 100,
    } as never);
    const updateSpy = vi.spyOn(browser.tabs, "update");

    const rect = await selectArea(0);

    expect(sendSpy).toHaveBeenCalledWith(0, { type: "select-area" });
    expect(updateSpy).toHaveBeenCalledWith(0, { active: true });
    expect(rect).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      viewportWidth: 100,
    });
  });

  it("returns null when the content script cancels", async () => {
    await fakeBrowser.tabs.update(0, { url: "https://a.co/x" });
    vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue(null as never);
    expect(await selectArea(0)).toBeNull();
  });

  it("skips focusing a window when the tab has none", async () => {
    vi.spyOn(browser.tabs, "get").mockResolvedValue({
      id: 0,
      index: 0,
      highlighted: false,
      active: false,
      pinned: false,
      incognito: false,
    } as never);
    const updateWindowSpy = vi.spyOn(browser.windows, "update");
    vi.spyOn(browser.tabs, "update").mockResolvedValue({} as never);
    vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue(null as never);

    await selectArea(0);

    expect(updateWindowSpy).not.toHaveBeenCalled();
  });
});

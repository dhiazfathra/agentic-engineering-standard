import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { add } from "../../lib/background/buffer";
import { takeScreenshot } from "../../lib/background/screenshot";
import { getDraft } from "../../lib/drafts";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe("takeScreenshot", () => {
  it("captures the tab, saves a draft, and opens the editor", async () => {
    await fakeBrowser.tabs.update(0, { url: "https://a.co/x", active: true });
    vi.spyOn(browser.tabs, "captureVisibleTab").mockResolvedValue(
      PNG_DATA_URL as never,
    );
    const createSpy = vi.spyOn(browser.tabs, "create");

    await add(0, { at: Date.now(), kind: "log", text: "hi", isError: false });

    const id = await takeScreenshot(0, "off");

    const draft = await getDraft(id);
    expect(draft?.kind).toBe("screenshot");
    expect(draft?.blob).toBeInstanceOf(Blob);
    expect(draft?.events).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledWith({
      url: expect.stringContaining(`/editor.html?id=${id}`),
    });
  });

  it("waits the requested delay", async () => {
    // Fakes only setTimeout/clearTimeout: Date and Node's fetch internals stay real.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await fakeBrowser.tabs.update(0, { url: "https://a.co/x", active: true });
    vi.spyOn(browser.tabs, "captureVisibleTab").mockResolvedValue(
      PNG_DATA_URL as never,
    );
    vi.spyOn(browser.tabs, "create").mockResolvedValue({} as never);

    const promise = takeScreenshot(0, "3s");
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toEqual(expect.any(String));
    vi.useRealTimers();
  });

  it("refuses when the user switched tabs during the delay", async () => {
    await fakeBrowser.tabs.update(0, { url: "https://a.co/x" });
    vi.spyOn(browser.tabs, "captureVisibleTab").mockResolvedValue(
      PNG_DATA_URL as never,
    );
    vi.spyOn(browser.tabs, "get").mockResolvedValue({
      id: 0,
      windowId: 0,
      url: "https://a.co/x",
      active: false,
    } as never);
    const createSpy = vi.spyOn(browser.tabs, "create");

    await expect(takeScreenshot(0, "off")).rejects.toThrow(
      "The tab is no longer visible",
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("refuses a non-http(s) tab", async () => {
    await fakeBrowser.tabs.update(0, { url: "chrome://extensions" });
    await expect(takeScreenshot(0, "off")).rejects.toThrow(
      "Cannot capture a non-http(s) tab",
    );
  });
});

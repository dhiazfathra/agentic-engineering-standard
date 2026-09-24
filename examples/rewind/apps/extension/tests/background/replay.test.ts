import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { clearSnapshots, getDraft, putSnapshot } from "../../lib/drafts";
import { isRunning, save, start, stop } from "../../lib/background/replay";

const JPEG_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  stop();
  await clearSnapshots();
});

describe("start/stop", () => {
  it("reports whether the loop is running", () => {
    expect(isRunning()).toBe(false);
    start();
    expect(isRunning()).toBe(true);
    start(); // idempotent
    stop();
    expect(isRunning()).toBe(false);
    stop(); // idempotent
  });

  it("captures the focused window's active http(s) tab every second", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 0, windowId: 0, url: "https://a.co/x" },
    ] as never);
    const captureSpy = vi
      .spyOn(browser.tabs, "captureVisibleTab")
      .mockResolvedValue(JPEG_DATA_URL as never);

    start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(captureSpy).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ format: "jpeg", quality: 60 }),
    );
    vi.useRealTimers();
  });

  it("skips a tick when there is no active http(s) tab", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 0, windowId: 0, url: "chrome://extensions" },
    ] as never);
    const captureSpy = vi.spyOn(browser.tabs, "captureVisibleTab");

    start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(captureSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("skips a tick when there is no active tab at all", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.spyOn(browser.tabs, "query").mockResolvedValue([] as never);
    const captureSpy = vi.spyOn(browser.tabs, "captureVisibleTab");

    start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(captureSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("ignores a capture failure", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 0, windowId: 0, url: "https://a.co/x" },
    ] as never);
    vi.spyOn(browser.tabs, "captureVisibleTab").mockRejectedValue(
      new Error("nope"),
    );

    start();
    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();
    vi.useRealTimers();
  });
});

describe("save", () => {
  it("returns an error when there are no snapshots", async () => {
    expect(await save(1)).toEqual({ error: "No replay yet" });
  });

  it("builds a replay draft from a tab's snapshots and opens the editor", async () => {
    await fakeBrowser.tabs.update(0, { url: "https://a.co/x" });
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    await putSnapshot({ tabId: 0, at: 1000, blob });
    await putSnapshot({ tabId: 0, at: 2000, blob });
    const createSpy = vi.spyOn(browser.tabs, "create");

    const result = await save(0);

    expect("id" in result).toBe(true);
    const id = (result as { id: string }).id;
    const draft = await getDraft(id);
    expect(draft?.kind).toBe("replay");
    expect(draft?.frames).toHaveLength(2);
    expect(createSpy).toHaveBeenCalledWith({
      url: expect.stringContaining(`/editor.html?id=${id}`),
    });
  });

  it("falls back to an empty url when the tab has none", async () => {
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    await putSnapshot({ tabId: 2, at: 1000, blob });
    vi.spyOn(browser.tabs, "get").mockResolvedValue({ id: 2 } as never);
    vi.spyOn(browser.tabs, "create").mockResolvedValue({} as never);

    const result = await save(2);
    const draft = await getDraft((result as { id: string }).id);
    expect(draft?.url).toBe("");
  });
});

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
    await fakeBrowser.tabs.update(0, { active: true, url: "https://a.co/x" });
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
    stop();
    expect(await save(0)).toHaveProperty("id");
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

  it("skips a snapshot when the tab stopped being visible mid-capture", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 3, windowId: 0, url: "https://a.co/x" },
    ] as never);
    vi.spyOn(browser.tabs, "captureVisibleTab").mockResolvedValue(
      JPEG_DATA_URL as never,
    );
    vi.spyOn(browser.tabs, "get").mockResolvedValue({
      id: 3,
      active: false,
    } as never);

    start();
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(await save(3)).toEqual({ error: "No replay yet" });
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
    // Within the last `REPLAY_MS` window, which `save` now reads from.
    await putSnapshot({ tabId: 0, at: Date.now() - 2000, blob });
    await putSnapshot({ tabId: 0, at: Date.now() - 1000, blob });
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

  it("ignores snapshots older than the replay window even when pruning was skipped", async () => {
    // Simulates a capture failure (e.g. tab went non-http(s) mid-tick),
    // which leaves `pruneSnapshots` unrun: `save` must still only read the
    // last `REPLAY_MS`, not everything ever stored for the tab.
    await fakeBrowser.tabs.update(0, { url: "https://a.co/x" });
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    await putSnapshot({ tabId: 0, at: Date.now() - 10 * 60_000, blob });
    await putSnapshot({ tabId: 0, at: Date.now() - 1000, blob });

    const result = await save(0);

    expect("id" in result).toBe(true);
    const id = (result as { id: string }).id;
    const draft = await getDraft(id);
    expect(draft?.frames).toHaveLength(1);
  });

  it("refuses a draft when the tab is no longer on an http(s) page", async () => {
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    await putSnapshot({ tabId: 2, at: Date.now() - 1000, blob });
    vi.spyOn(browser.tabs, "get").mockResolvedValue({
      id: 2,
      url: "chrome://extensions",
    } as never);
    const createSpy = vi.spyOn(browser.tabs, "create");

    expect(await save(2)).toEqual({ error: "Replay needs an http(s) page" });
    expect(createSpy).not.toHaveBeenCalled();
  });
});

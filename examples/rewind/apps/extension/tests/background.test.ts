import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import background from "../entrypoints/background";
import * as replay from "../lib/background/replay";
import { getDraft } from "../lib/drafts";
import { resetSettings, updateSettings } from "../lib/settings";

function commandListener() {
  const spy = vi
    .spyOn(browser.commands.onCommand, "addListener")
    .mockImplementation(() => {});
  background.main();
  return spy.mock.calls[0]![0] as (command: string) => void | Promise<void>;
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  replay.stop();
  // fakeBrowser has no in-memory `commands` API; every `background.main()` call
  // registers one, so stub it out unless a test wants the real listener back.
  vi.spyOn(browser.commands.onCommand, "addListener").mockImplementation(
    () => {},
  );
  await resetSettings();
});

describe("background", () => {
  it("starts without throwing", () => {
    expect(() => background.main()).not.toThrow();
  });

  describe("message routing", () => {
    it("adds an event to its sender tab's buffer", async () => {
      background.main();
      const now = Date.now();
      const capturedEvent = {
        at: now,
        kind: "log" as const,
        text: "hi",
        isError: false,
      };
      await fakeBrowser.runtime.onMessage.trigger(
        { type: "event", event: capturedEvent },
        { tab: { id: 9 } } as never,

        () => {},
      );
      const [events] = await fakeBrowser.runtime.onMessage.trigger(
        {
          type: "events",
          tabId: 9,
          spans: [{ start: now - 1000, end: now + 1000 }],
        },
        {},

        () => {},
      );
      expect(events).toEqual([
        { t: 1, kind: "log", text: "hi", isError: false },
      ]);
    });

    it("ignores an event message with no sender tab", async () => {
      background.main();
      const [result] = await fakeBrowser.runtime.onMessage.trigger(
        {
          type: "event",
          event: { at: 1, kind: "log", text: "x", isError: false },
        },
        {},

        () => {},
      );
      expect(result).toBeUndefined();
    });

    it("takes a screenshot for the requested tab", async () => {
      background.main();
      await fakeBrowser.tabs.update(0, { url: "https://a.co/x", active: true });
      vi.spyOn(browser.tabs, "captureVisibleTab").mockResolvedValue(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" as never,
      );
      const createSpy = vi.spyOn(browser.tabs, "create");

      const [id] = await fakeBrowser.runtime.onMessage.trigger(
        { type: "screenshot", tabId: 0 },
        {},
        () => {},
      );

      expect(await getDraft(id as unknown as string)).toMatchObject({
        kind: "screenshot",
      });
      expect(createSpy).toHaveBeenCalled();
    });

    it("opens the recorder window", async () => {
      background.main();
      const createSpy = vi
        .spyOn(browser.windows, "create")
        .mockResolvedValue({} as never);
      await fakeBrowser.runtime.onMessage.trigger(
        { type: "record", tabId: 3, mode: "tab" },
        {},
        () => {},
      );
      expect(createSpy).toHaveBeenCalled();
    });

    it("holds and releases a tab's buffer", async () => {
      background.main();
      await fakeBrowser.runtime.onMessage.trigger(
        { type: "recording", tabId: 3, since: 0 },
        {},
        () => {},
      );
      const [events] = await fakeBrowser.runtime.onMessage.trigger(
        { type: "recording", tabId: 3, since: null },
        {},
        () => {},
      );
      expect(events).toBeUndefined();
    });

    it("relays an area request to the tab", async () => {
      background.main();
      await fakeBrowser.tabs.update(0, { url: "https://a.co/x" });
      vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue(null as never);
      const [rect] = await fakeBrowser.runtime.onMessage.trigger(
        { type: "area", tabId: 0 },
        {},
        () => {},
      );
      expect(rect).toBeNull();
    });

    it("saves a replay", async () => {
      background.main();
      const [result] = await fakeBrowser.runtime.onMessage.trigger(
        { type: "save-replay", tabId: 5 },
        {},
        () => {},
      );
      expect(result).toEqual({ error: "No replay yet" });
    });

    it("ignores an unrecognized message type", async () => {
      background.main();
      const [result] = await fakeBrowser.runtime.onMessage.trigger(
        { type: "select-area" },
        {},
        () => {},
      );
      expect(result).toBeUndefined();
    });
  });

  it("drops a tab's buffer when it closes", async () => {
    background.main();
    const capturedEvent = {
      at: Date.now(),
      kind: "log" as const,
      text: "hi",
      isError: false,
    };
    await fakeBrowser.runtime.onMessage.trigger(
      { type: "event", event: capturedEvent },
      { tab: { id: 9 } } as never,

      () => {},
    );
    await fakeBrowser.tabs.onRemoved.trigger(9, {
      isWindowClosing: false,
      windowId: 1,
    });
    const [events] = await fakeBrowser.runtime.onMessage.trigger(
      {
        type: "events",
        tabId: 9,
        spans: [{ start: 0, end: Date.now() + 1000 }],
      },
      {},

      () => {},
    );
    expect(events).toEqual([]);
  });

  it("keeps a held buffer when its tab closes, and drops it on release", async () => {
    background.main();
    const eventsOf9 = async () =>
      (
        await fakeBrowser.runtime.onMessage.trigger(
          {
            type: "events",
            tabId: 9,
            spans: [{ start: 0, end: Date.now() + 1000 }],
          },
          {},
          () => {},
        )
      )[0];
    await fakeBrowser.runtime.onMessage.trigger(
      { type: "recording", tabId: 9, since: Date.now() },
      {},
      () => {},
    );
    await fakeBrowser.runtime.onMessage.trigger(
      {
        type: "event",
        event: { at: Date.now(), kind: "log", text: "hi", isError: false },
      },
      { tab: { id: 9 } } as never,
      () => {},
    );
    await fakeBrowser.tabs.onRemoved.trigger(9, {
      isWindowClosing: false,
      windowId: 1,
    });
    expect(await eventsOf9()).toHaveLength(1);

    vi.spyOn(browser.tabs, "get").mockRejectedValue(new Error("No tab 9"));
    await fakeBrowser.runtime.onMessage.trigger(
      { type: "recording", tabId: 9, since: null },
      {},
      () => {},
    );
    expect(await eventsOf9()).toEqual([]);
  });

  // Sets up the default tab's real state (id 0) and points `tabs.query` at it,
  // since fakeBrowser's real `query` needs a focused window that nothing in
  // this suite creates.
  async function stubActiveTab(): Promise<void> {
    await fakeBrowser.tabs.update(0, { url: "https://a.co/x", active: true });
    vi.spyOn(browser.tabs, "query").mockImplementation(async () => [
      await fakeBrowser.tabs.get(0),
    ]);
  }

  describe("commands", () => {
    it("takes a screenshot on the screenshot command", async () => {
      const onCommand = commandListener();
      await stubActiveTab();
      vi.spyOn(browser.tabs, "captureVisibleTab").mockResolvedValue(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" as never,
      );
      const createSpy = vi.spyOn(browser.tabs, "create");
      await onCommand("screenshot");
      expect(createSpy).toHaveBeenCalled();
    });

    it("saves a replay on the save-replay command", async () => {
      const onCommand = commandListener();
      await stubActiveTab();
      await expect(onCommand("save-replay")).resolves.toBeUndefined();
    });

    it("ignores an unknown command", async () => {
      const onCommand = commandListener();
      await stubActiveTab();
      await expect(onCommand("other")).resolves.toBeUndefined();
    });

    it("does nothing when there is no active tab", async () => {
      const onCommand = commandListener();
      vi.spyOn(browser.tabs, "query").mockResolvedValue([] as never);
      await expect(onCommand("screenshot")).resolves.toBeUndefined();
    });
  });

  describe("instant replay", () => {
    it("starts the replay loop and schedules the alarm when turned on", async () => {
      background.main();
      const alarmSpy = vi.spyOn(browser.alarms, "create");
      await updateSettings({ instantReplay: true });
      await vi.waitFor(() =>
        expect(alarmSpy).toHaveBeenCalledWith("replay", {
          periodInMinutes: 0.5,
        }),
      );
    });

    it("ignores a settings change that doesn't touch instantReplay", async () => {
      background.main();
      const alarmSpy = vi.spyOn(browser.alarms, "create");
      await updateSettings({ reporterName: "Ada" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(alarmSpy).not.toHaveBeenCalled();
    });

    it("stops the loop and clears snapshots when turned off", async () => {
      await updateSettings({ instantReplay: true });
      background.main();
      await updateSettings({ instantReplay: false });
      await vi.waitFor(async () => {
        const stored = (await fakeBrowser.storage.local.get("settings")) as {
          settings: { instantReplay: boolean };
        };
        expect(stored.settings.instantReplay).toBe(false);
      });
    });

    it("restarts the loop from the alarm when the setting is on", async () => {
      await updateSettings({ instantReplay: true });
      background.main();
      replay.stop();
      await fakeBrowser.alarms.onAlarm.trigger({
        name: "replay",
        scheduledTime: Date.now(),
        persistAcrossSessions: false,
      });
      expect(replay.isRunning()).toBe(true);
    });

    it("does not restart the loop from the alarm when the setting is off", async () => {
      background.main();
      await fakeBrowser.alarms.onAlarm.trigger({
        name: "replay",
        scheduledTime: Date.now(),
        persistAcrossSessions: false,
      });
      expect(replay.isRunning()).toBe(false);
    });

    it("ignores an alarm that isn't the replay alarm", async () => {
      background.main();
      await expect(
        fakeBrowser.alarms.onAlarm.trigger({
          name: "other",
          scheduledTime: Date.now(),
          persistAcrossSessions: false,
        }),
      ).resolves.toBeDefined();
    });

    it("starts the loop at startup when instant replay is already on", async () => {
      await updateSettings({ instantReplay: true });
      const alarmSpy = vi.spyOn(browser.alarms, "create");
      background.main();
      await vi.waitFor(() =>
        expect(alarmSpy).toHaveBeenCalledWith("replay", {
          periodInMinutes: 0.5,
        }),
      );
    });
  });
});

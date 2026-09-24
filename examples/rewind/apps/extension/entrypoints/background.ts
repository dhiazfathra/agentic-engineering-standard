import { browser } from "wxt/browser";
import type { Browser } from "wxt/browser";
import * as buffer from "../lib/background/buffer";
import { openRecorder, selectArea } from "../lib/background/recorder";
import * as replay from "../lib/background/replay";
import { takeScreenshot } from "../lib/background/screenshot";
import { clearSnapshots } from "../lib/drafts";
import type { Message } from "../lib/messages";
import { settings } from "../lib/settings";

const REPLAY_ALARM = "replay";
const REPLAY_ALARM_PERIOD_MINUTES = 0.5;

async function handleMessage(
  message: Message,
  sender: Browser.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case "event":
      if (sender.tab?.id == null) return undefined;
      return buffer.add(sender.tab.id, message.event);
    case "events":
      return buffer.eventsFor(message.tabId, message.spans);
    case "screenshot": {
      const { delay } = await settings.getValue();
      return takeScreenshot(message.tabId, delay);
    }
    case "record":
      return openRecorder(message.tabId, message.mode, message.streamId);
    case "recording":
      await buffer.hold(message.tabId, message.since);
      if (message.since === null) {
        await browser.tabs
          .get(message.tabId)
          .catch(() => buffer.drop(message.tabId));
      }
      return undefined;
    case "area":
      return selectArea(message.tabId);
    case "save-replay":
      return replay.save(message.tabId);
    default:
      return undefined;
  }
}

async function onInstantReplayChange(enabled: boolean): Promise<void> {
  if (enabled) {
    replay.start();
    await browser.alarms.create(REPLAY_ALARM, {
      periodInMinutes: REPLAY_ALARM_PERIOD_MINUTES,
    });
  } else {
    replay.stop();
    await clearSnapshots();
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, sender) =>
    handleMessage(message, sender),
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    void buffer.drop(tabId);
  });

  browser.commands.onCommand.addListener(async (command) => {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id == null) return;
    if (command === "screenshot") {
      const { delay } = await settings.getValue();
      await takeScreenshot(tab.id, delay);
    } else if (command === "save-replay") {
      await replay.save(tab.id);
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== REPLAY_ALARM) return;
    const { instantReplay } = await settings.getValue();
    if (instantReplay) replay.start();
  });

  settings.watch((next, prev) => {
    if (next.instantReplay !== prev?.instantReplay) {
      void onInstantReplayChange(next.instantReplay);
    }
  });

  void settings.getValue().then((s) => {
    if (s.instantReplay) void onInstantReplayChange(true);
  });
});

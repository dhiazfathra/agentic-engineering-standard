import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { add, drop, eventsFor, hold, raw } from "../../lib/background/buffer";
import type { CapturedEvent } from "../../lib/messages";

const BASE = 1_000_000;

function eventAt(at: number): CapturedEvent {
  return { at, kind: "log", text: String(at), isError: false };
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
});

afterEach(() => {
  // Flushes any pending debounced save before the next test installs a new
  // fake clock, which would otherwise abandon it and leave `saveTimer` set.
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("buffer", () => {
  it("adds events and returns them via eventsFor over a span", async () => {
    await add(1, eventAt(BASE - 100));
    await add(1, eventAt(BASE - 50));
    const events = await eventsFor(1, [{ start: BASE - 1000, end: BASE }]);
    expect(events.map((e) => e.text)).toEqual([
      String(BASE - 100),
      String(BASE - 50),
    ]);
  });

  it("keeps tabs isolated", async () => {
    await add(2, eventAt(BASE));
    expect(await raw(3)).toEqual([]);
    expect(await raw(2)).toHaveLength(1);
  });

  it("hold keeps events older than the replay window, release drops them again", async () => {
    vi.setSystemTime(0);
    hold(4, 0);
    await add(4, eventAt(0));
    vi.setSystemTime(200_000); // past REPLAY_MS
    await add(4, eventAt(200_000));
    expect(await raw(4)).toHaveLength(2);

    hold(4, null);
    await add(4, eventAt(200_001));
    expect((await raw(4)).map((e) => e.at)).toEqual([200_000, 200_001]);
  });

  it("drop clears a tab's buffer and hold", async () => {
    await add(5, eventAt(BASE));
    await drop(5);
    expect(await raw(5)).toEqual([]);
  });

  it("debounces the save to storage.session", async () => {
    await add(6, eventAt(BASE));
    await add(6, eventAt(BASE + 1));
    await vi.advanceTimersByTimeAsync(1000);
    const stored = (await fakeBrowser.storage.session.get("buffer")) as {
      buffer: Record<number, unknown[]>;
    };
    expect(stored.buffer[6]).toHaveLength(2);
  });
});

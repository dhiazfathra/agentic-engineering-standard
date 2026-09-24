import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  add,
  clearStaleHolds,
  drop,
  eventsFor,
  hold,
  MAX_RECORDING_MS,
  parseCapturedEvent,
  raw,
} from "../../lib/background/buffer";
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
    await hold(4, 0);
    await add(4, eventAt(0));
    vi.setSystemTime(200_000); // past REPLAY_MS
    await add(4, eventAt(200_000));
    expect(await raw(4)).toHaveLength(2);

    await hold(4, null);
    await add(4, eventAt(200_001));
    expect((await raw(4)).map((e) => e.at)).toEqual([200_000, 200_001]);
  });

  it("persists the hold to storage.session and it survives a worker restart", async () => {
    vi.setSystemTime(0);
    await hold(7, 0);
    const stored = (await fakeBrowser.storage.session.get("holds")) as {
      holds: Record<number, number>;
    };
    expect(stored.holds[7]).toBe(0);

    // Simulates an MV3 service-worker restart: in-memory module state is gone,
    // so the next call must reload the hold from storage.session.
    vi.resetModules();
    const restarted = await import("../../lib/background/buffer");
    vi.setSystemTime(200_000); // past REPLAY_MS
    await restarted.add(7, eventAt(200_000));
    expect(await restarted.raw(7)).toHaveLength(1);
  });

  it("clearing a hold removes it from storage.session too", async () => {
    await hold(8, 100);
    await hold(8, null);
    const stored = (await fakeBrowser.storage.session.get("holds")) as {
      holds: Record<number, number>;
    };
    expect(stored.holds[8]).toBeUndefined();
  });

  it("drop clears a tab's buffer", async () => {
    await add(5, eventAt(BASE));
    await drop(5);
    expect(await raw(5)).toEqual([]);
  });

  it("drop keeps a buffer a recording still holds", async () => {
    await hold(6, BASE);
    await add(6, eventAt(BASE));
    await drop(6);
    expect(await raw(6)).toHaveLength(1);
    await hold(6, null);
    await drop(6);
    expect(await raw(6)).toEqual([]);
  });

  it("survives two concurrent `add`s on a cold buffer (no lost load overwrite)", async () => {
    vi.resetModules();
    const cold = await import("../../lib/background/buffer");
    await Promise.all([
      cold.add(9, eventAt(BASE)),
      cold.add(9, eventAt(BASE + 1)),
    ]);
    expect((await cold.raw(9)).map((e) => e.at)).toEqual([BASE, BASE + 1]);
  });

  it("parseCapturedEvent accepts a well-shaped event", () => {
    expect(parseCapturedEvent(eventAt(BASE))).toEqual(eventAt(BASE));
  });

  it.each([
    ["non-string text", { ...eventAt(BASE), text: 123 }],
    ["unknown kind", { ...eventAt(BASE), kind: "not-a-kind" }],
    ["non-finite at", { ...eventAt(BASE), at: Number.POSITIVE_INFINITY }],
    ["missing isError", { at: BASE, kind: "log", text: "x" }],
    ["far-future at", { ...eventAt(BASE), at: BASE + 10_000 }],
    ["not an object", "just a string"],
  ])("parseCapturedEvent rejects %s", (_name, value) => {
    expect(parseCapturedEvent(value)).toBeNull();
  });

  it("add silently drops a forged event that fails validation", async () => {
    await add(10, { ...eventAt(BASE), kind: "bogus" });
    expect(await raw(10)).toEqual([]);
  });

  it("clearStaleHolds drops a hold older than MAX_RECORDING_MS, keeps a recent one", async () => {
    await hold(11, BASE - MAX_RECORDING_MS - 1);
    await hold(12, BASE - 100);
    await clearStaleHolds(BASE);

    const stored = (await fakeBrowser.storage.session.get("holds")) as {
      holds: Record<number, number>;
    };
    expect(stored.holds[11]).toBeUndefined();
    expect(stored.holds[12]).toBe(BASE - 100);
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

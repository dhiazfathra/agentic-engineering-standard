import { describe, expect, it } from "vitest";
import { MAX_EVENTS, REPLAY_MS, trim } from "../lib/buffer";
import type { CapturedEvent } from "../lib/messages";

function eventAt(at: number): CapturedEvent {
  return { at, kind: "log", text: String(at), isError: false };
}

describe("trim", () => {
  it("drops events older than REPLAY_MS with no hold", () => {
    const now = 1_000_000;
    const events = [eventAt(now - REPLAY_MS - 1), eventAt(now - 100)];
    expect(trim(events, now, null)).toEqual([eventAt(now - 100)]);
  });

  it("keeps events since holdSince even if older than REPLAY_MS", () => {
    const now = 1_000_000;
    const holdSince = now - REPLAY_MS - 5000;
    const events = [eventAt(holdSince + 10), eventAt(now - REPLAY_MS - 6000)];
    expect(trim(events, now, holdSince)).toEqual([eventAt(holdSince + 10)]);
  });

  it("uses the earlier cutoff when holdSince is newer than REPLAY_MS window", () => {
    const now = 1_000_000;
    const holdSince = now - 1000;
    const events = [eventAt(now - REPLAY_MS + 1)];
    expect(trim(events, now, holdSince)).toEqual(events);
  });

  it("keeps at most MAX_EVENTS, the newest ones", () => {
    const now = MAX_EVENTS + 10;
    const events = Array.from({ length: MAX_EVENTS + 5 }, (_, i) => eventAt(i));
    const result = trim(events, now, null);
    expect(result).toHaveLength(MAX_EVENTS);
    expect(result[0]).toEqual(eventAt(5));
  });
});

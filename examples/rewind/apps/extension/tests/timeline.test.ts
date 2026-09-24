import { describe, expect, it } from "vitest";
import {
  mediaTime,
  spanSeconds,
  toRewindEvents,
  trimEvents,
  type Span,
} from "../lib/timeline";
import type { CapturedEvent } from "../lib/messages";

describe("mediaTime", () => {
  it("returns null before every span", () => {
    expect(mediaTime(5, [{ start: 10, end: 20 }])).toBeNull();
  });

  it("returns seconds within the first span", () => {
    expect(mediaTime(15, [{ start: 10, end: 20 }])).toBe(0.005);
  });

  it("accumulates time across earlier spans", () => {
    const spans: Span[] = [
      { start: 0, end: 1000 },
      { start: 2000, end: 3000 },
    ];
    expect(mediaTime(2500, spans)).toBe(1.5);
  });

  it("returns null between spans", () => {
    const spans: Span[] = [
      { start: 0, end: 1000 },
      { start: 2000, end: 3000 },
    ];
    expect(mediaTime(1500, spans)).toBeNull();
  });

  it("returns null after every span", () => {
    expect(mediaTime(30, [{ start: 0, end: 10 }])).toBeNull();
  });
});

describe("spanSeconds", () => {
  it("sums span durations in seconds", () => {
    expect(
      spanSeconds([
        { start: 0, end: 1000 },
        { start: 2000, end: 2500 },
      ]),
    ).toBe(1.5);
  });

  it("is zero for no spans", () => {
    expect(spanSeconds([])).toBe(0);
  });
});

describe("toRewindEvents", () => {
  const spans: Span[] = [{ start: 0, end: 10_000 }];

  it("drops events outside the spans", () => {
    const captured: CapturedEvent[] = [
      { at: 20_000, kind: "log", text: "outside", isError: false },
    ];
    expect(toRewindEvents(captured, spans)).toEqual([]);
  });

  it("sorts by t and cuts text at 10,000 chars", () => {
    const long = "x".repeat(10_050);
    const captured: CapturedEvent[] = [
      { at: 5000, kind: "log", text: "second", isError: false },
      { at: 1000, kind: "log", text: long, isError: false },
    ];
    const events = toRewindEvents(captured, spans);
    expect(events.map((e) => e.text.length === 10_000 || e.text)).toEqual([
      true,
      "second",
    ]);
  });

  it("keeps at most 10,000 events", () => {
    const captured: CapturedEvent[] = Array.from(
      { length: 10_002 },
      (_, i) => ({
        at: i,
        kind: "log" as const,
        text: String(i),
        isError: false,
      }),
    );
    expect(toRewindEvents(captured, [{ start: 0, end: 10_002 }])).toHaveLength(
      10_000,
    );
  });
});

describe("trimEvents", () => {
  it("keeps events within range and shifts by start", () => {
    const events = [
      { t: 0, kind: "log" as const, text: "a", isError: false },
      { t: 5, kind: "log" as const, text: "b", isError: false },
      { t: 15, kind: "log" as const, text: "c", isError: false },
    ];
    expect(trimEvents(events, 2, 10)).toEqual([
      { t: 3, kind: "log", text: "b", isError: false },
    ]);
  });
});

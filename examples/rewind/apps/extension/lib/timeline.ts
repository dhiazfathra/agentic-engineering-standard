import type { Event } from "@rewind/schema";
import type { CapturedEvent } from "./messages";

export type Span = { start: number; end: number };

/** Seconds of active capture before `at`, or null when `at` is outside every span. */
export function mediaTime(at: number, spans: Span[]): number | null {
  let t = 0;
  for (const s of spans) {
    if (at < s.start) return null;
    if (at <= s.end) return (t + at - s.start) / 1000;
    t += s.end - s.start;
  }
  return null;
}

/** Total active seconds covered by `spans`. */
export function spanSeconds(spans: Span[]): number {
  return spans.reduce((total, s) => total + (s.end - s.start), 0) / 1000;
}

/** Converts captured events into `@rewind/schema` events over `spans`. */
export function toRewindEvents(
  captured: CapturedEvent[],
  spans: Span[],
): Event[] {
  const events: Event[] = [];
  for (const c of captured) {
    const t = mediaTime(c.at, spans);
    if (t === null) continue;
    events.push({
      t,
      kind: c.kind,
      text: c.text.slice(0, 10_000),
      isError: c.isError,
    });
  }
  events.sort((a, b) => a.t - b.t);
  return events.slice(-10_000);
}

/** Keeps events with `start <= t <= end`, shifted so `start` becomes 0. */
export function trimEvents(
  events: Event[],
  start: number,
  end: number,
): Event[] {
  return events
    .filter((e) => e.t >= start && e.t <= end)
    .map((e) => ({ ...e, t: e.t - start }));
}

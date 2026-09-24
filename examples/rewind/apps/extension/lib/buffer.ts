import type { CapturedEvent } from "./messages";

export const REPLAY_MS = 120_000;
export const MAX_EVENTS = 10_000;

/**
 * Keeps events newer than `now - REPLAY_MS`, or newer than `holdSince` when
 * given, then the newest `MAX_EVENTS` of those.
 */
export function trim(
  events: CapturedEvent[],
  now: number,
  holdSince: number | null,
): CapturedEvent[] {
  const cutoff =
    holdSince === null ? now - REPLAY_MS : Math.min(holdSince, now - REPLAY_MS);
  const kept = events.filter((e) => e.at >= cutoff);
  return kept.slice(-MAX_EVENTS);
}

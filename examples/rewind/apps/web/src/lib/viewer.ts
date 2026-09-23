import type { EventKind, RewindStatus } from "@rewind/schema";

export type ViewerEvent = {
  id: string;
  t: number;
  kind: EventKind;
  text: string;
  isError: boolean;
};

export type ViewerComment = {
  id: string;
  t: number;
  x: number;
  y: number;
  author: string;
  text: string;
};

export type ViewerTab = "info" | "events" | "console" | "network" | "comments";

/** `m:ss`, floors fractional seconds. */
export function formatTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "Just now" / "N min ago" / "N h ago" / "N d ago". */
export function timeAgo(from: Date, now: Date = new Date()): string {
  const ms = now.getTime() - from.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

const TAB_KINDS: Partial<Record<ViewerTab, EventKind[]>> = {
  events: ["nav", "click", "input"],
  console: ["log", "warn", "err"],
  network: ["net"],
};

/** The events for a tab, in their given order; other tabs get none. */
export function tabEvents(
  events: ViewerEvent[],
  tab: ViewerTab,
): ViewerEvent[] {
  const kinds = TAB_KINDS[tab];
  if (!kinds) return [];
  return events.filter((e) => kinds.includes(e.kind));
}

export type Step = { n: number; text: string; t: number };

/** One numbered step per user event (nav/click/input), in time order. */
export function stepsToReproduce(events: ViewerEvent[]): Step[] {
  return tabEvents(events, "events").map((e, i) => ({
    n: i + 1,
    text: e.text,
    t: e.t,
  }));
}

export type TimelineMarker = { t: number; leftPct: number; tone: string };

/** Errors (tall, red), navigations (teal) and clicks (grey). */
export function timelineMarkers(
  events: ViewerEvent[],
  duration: number,
): TimelineMarker[] {
  return events
    .filter((e) => e.isError || e.kind === "click" || e.kind === "nav")
    .map((e) => ({
      t: e.t,
      leftPct: duration > 0 ? (e.t / duration) * 100 : 0,
      tone: e.isError ? "error" : e.kind === "nav" ? "nav" : "click",
    }));
}

/** The index of the last event at or before `t`, or -1 if none. */
export function currentEventIndex(events: ViewerEvent[], t: number): number {
  return events.reduce((m, e, i) => (e.t <= t ? i : m), -1);
}

/** Comments within 4s of the playhead. */
export function commentsNear(
  comments: ViewerComment[],
  t: number,
): ViewerComment[] {
  return comments.filter((c) => Math.abs(t - c.t) < 4);
}

/** Up to two uppercase initials from a name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]![0];
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (first + last).toUpperCase();
}

// The design's PEOPLE map (Rewind.dc.html).
const PEOPLE: Record<string, string> = {
  "Maya Chen": "#01afaf",
  "Dhiaz Fathra": "#3538cd",
  "Leo Park": "#e65100",
  "Sara Ali": "#a65f00",
};

// A stable fallback palette for names not in PEOPLE.
const PALETTE = ["#3538cd", "#01afaf", "#e65100", "#a65f00", "#7a4e1e"];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** The design's PEOPLE color, else a stable hash into a small palette. */
export function personColor(name: string): string {
  return PEOPLE[name] ?? PALETTE[hash(name) % PALETTE.length]!;
}

export const EVENT_TAG: Record<EventKind, string> = {
  err: "ERROR",
  warn: "WARN",
  net: "NET",
  nav: "NAV",
  click: "CLICK",
  input: "INPUT",
  log: "LOG",
};

export const EVENT_TONE: Record<EventKind, string> = {
  err: "error",
  warn: "warn",
  net: "net",
  nav: "nav",
  click: "body",
  input: "body",
  log: "muted",
};

export const STATUS_LABEL: Record<RewindStatus, string> = {
  new: "New",
  triage: "Triaging",
  progress: "In progress",
  done: "Fixed",
};

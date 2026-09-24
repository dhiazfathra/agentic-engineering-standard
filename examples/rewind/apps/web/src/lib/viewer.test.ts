import { describe, expect, it } from "vitest";
import {
  commentsNear,
  currentEventIndex,
  EVENT_TAG,
  EVENT_TONE,
  formatTime,
  initials,
  personColor,
  STATUS_LABEL,
  stepsToReproduce,
  tabEvents,
  timeAgo,
  timelineMarkers,
  type ViewerComment,
  type ViewerEvent,
} from "./viewer";

const ev = (over: Partial<ViewerEvent>): ViewerEvent => ({
  id: "e",
  t: 0,
  kind: "log",
  text: "",
  isError: false,
  ...over,
});

describe("formatTime", () => {
  it("formats m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65)).toBe("1:05");
  });

  it("floors fractional seconds", () => {
    expect(formatTime(5.9)).toBe("0:05");
  });

  it("floors negatives to 0", () => {
    expect(formatTime(-3)).toBe("0:00");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("Just now under a minute", () => {
    expect(timeAgo(new Date(now.getTime() - 30_000), now)).toBe("Just now");
  });

  it("N min ago under an hour", () => {
    expect(timeAgo(new Date(now.getTime() - 5 * 60_000), now)).toBe(
      "5 min ago",
    );
  });

  it("N h ago under a day", () => {
    expect(timeAgo(new Date(now.getTime() - 3 * 3_600_000), now)).toBe(
      "3 h ago",
    );
  });

  it("N d ago at a day or more", () => {
    expect(timeAgo(new Date(now.getTime() - 2 * 86_400_000), now)).toBe(
      "2 d ago",
    );
  });
});

describe("tabEvents", () => {
  const events = [
    ev({ kind: "nav" }),
    ev({ kind: "click" }),
    ev({ kind: "input" }),
    ev({ kind: "net" }),
    ev({ kind: "log" }),
    ev({ kind: "warn" }),
    ev({ kind: "err" }),
  ];

  it("events tab: nav/click/input", () => {
    expect(tabEvents(events, "events").map((e) => e.kind)).toEqual([
      "nav",
      "click",
      "input",
    ]);
  });

  it("console tab: log/warn/err", () => {
    expect(tabEvents(events, "console").map((e) => e.kind)).toEqual([
      "log",
      "warn",
      "err",
    ]);
  });

  it("network tab: net", () => {
    expect(tabEvents(events, "network").map((e) => e.kind)).toEqual(["net"]);
  });

  it("other tabs: none", () => {
    expect(tabEvents(events, "info")).toEqual([]);
    expect(tabEvents(events, "comments")).toEqual([]);
  });
});

describe("stepsToReproduce", () => {
  it("one numbered step per user event, in time order", () => {
    const events = [
      ev({ t: 5, kind: "click", text: "clicked" }),
      ev({ t: 0, kind: "nav", text: "navigated" }),
      ev({ t: 2, kind: "net", text: "ignored" }),
    ];
    expect(stepsToReproduce(events)).toEqual([
      { n: 1, text: "clicked", t: 5 },
      { n: 2, text: "navigated", t: 0 },
    ]);
  });
});

describe("timelineMarkers", () => {
  it("errors, navs and clicks, positioned by duration", () => {
    const events = [
      ev({ id: "a", t: 10, kind: "err", isError: true }),
      ev({ id: "b", t: 20, kind: "nav" }),
      ev({ id: "c", t: 30, kind: "click" }),
      ev({ t: 40, kind: "log" }),
    ];
    expect(timelineMarkers(events, 100)).toEqual([
      { id: "a", t: 10, leftPct: 10, tone: "error" },
      { id: "b", t: 20, leftPct: 20, tone: "nav" },
      { id: "c", t: 30, leftPct: 30, tone: "click" },
    ]);
  });

  it("0% when duration is 0", () => {
    expect(timelineMarkers([ev({ t: 5, kind: "nav" })], 0)).toEqual([
      { id: "e", t: 5, leftPct: 0, tone: "nav" },
    ]);
  });
});

describe("currentEventIndex", () => {
  it("the last event at or before t", () => {
    const events = [ev({ t: 0 }), ev({ t: 5 }), ev({ t: 10 })];
    expect(currentEventIndex(events, 7)).toBe(1);
  });

  it("-1 when nothing is at or before t", () => {
    expect(currentEventIndex([ev({ t: 5 })], 0)).toBe(-1);
  });
});

describe("commentsNear", () => {
  const comment = (t: number): ViewerComment => ({
    id: `c${t}`,
    t,
    x: 0,
    y: 0,
    author: "a",
    text: "",
  });

  it("keeps comments within 4s of the playhead", () => {
    expect(
      commentsNear([comment(10), comment(20)], 12).map((c) => c.t),
    ).toEqual([10]);
  });

  it("excludes comments exactly 4s away", () => {
    expect(commentsNear([comment(10)], 14)).toEqual([]);
  });
});

describe("initials", () => {
  it("first and last name", () => {
    expect(initials("Maya Chen")).toBe("MC");
  });

  it("single name", () => {
    expect(initials("Maya")).toBe("M");
  });

  it("empty name", () => {
    expect(initials("")).toBe("");
  });
});

describe("personColor", () => {
  it("uses the design's PEOPLE map", () => {
    expect(personColor("Maya Chen")).toBe("#01afaf");
    expect(personColor("Dhiaz Fathra")).toBe("#3538cd");
    expect(personColor("Leo Park")).toBe("#e65100");
    expect(personColor("Sara Ali")).toBe("#a65f00");
  });

  it("a stable hash for unknown names", () => {
    const a = personColor("Unknown Person");
    const b = personColor("Unknown Person");
    expect(a).toBe(b);
    expect(typeof a).toBe("string");
  });
});

describe("static maps", () => {
  it("EVENT_TAG covers every kind", () => {
    expect(EVENT_TAG.err).toBe("ERROR");
    expect(EVENT_TAG.warn).toBe("WARN");
    expect(EVENT_TAG.net).toBe("NET");
    expect(EVENT_TAG.nav).toBe("NAV");
    expect(EVENT_TAG.click).toBe("CLICK");
    expect(EVENT_TAG.input).toBe("INPUT");
    expect(EVENT_TAG.log).toBe("LOG");
  });

  it("EVENT_TONE covers every kind", () => {
    expect(EVENT_TONE.err).toBe("error");
    expect(EVENT_TONE.log).toBe("muted");
  });

  it("STATUS_LABEL covers every status", () => {
    expect(STATUS_LABEL.new).toBe("New");
    expect(STATUS_LABEL.triage).toBe("Triaging");
    expect(STATUS_LABEL.progress).toBe("In progress");
    expect(STATUS_LABEL.done).toBe("Fixed");
  });
});

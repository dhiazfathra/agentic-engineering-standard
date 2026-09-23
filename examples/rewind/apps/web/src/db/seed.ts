import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { comments, events, folders, recordingLinks, rewinds } from "./schema";
import type * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;

const FOLDER_IDS = {
  Checkout: "seed-folder-checkout",
  "Mobile web": "seed-folder-mobile-web",
  "Q3 regressions": "seed-folder-q3-regressions",
} as const;

const LINK_IDS = {
  "Support: checkout issues": "seed-link-support-checkout",
  "Beta testers": "seed-link-beta-testers",
} as const;

// Design's JAMS, from docs/design/Rewind.dc.html.
const JAMS = [
  {
    id: "r1",
    title: "Checkout fails after applying coupon",
    url: "shop.acme.co/cart",
    by: "Maya Chen",
    agoMs: 12 * 60_000,
    dur: "0:42",
    status: "new",
    folder: "Checkout",
  },
  {
    id: "r2",
    title: "Coupon total shows NaN on mobile",
    url: "m.acme.co/cart",
    by: "Sara Ali",
    agoMs: 60 * 60_000,
    dur: "0:31",
    status: "new",
    folder: "Mobile web",
  },
  {
    id: "r3",
    title: "Checkout button spins forever",
    url: "shop.acme.co/checkout",
    by: "Leo Park",
    agoMs: 3 * 60 * 60_000,
    dur: "1:04",
    status: "triage",
    folder: "Checkout",
  },
  {
    id: "r4",
    title: "Avatar upload crops the wrong side",
    url: "app.acme.co/settings/profile",
    by: "Dhiaz Fathra",
    agoMs: 24 * 60 * 60_000,
    dur: "shot",
    status: "progress",
    folder: "Q3 regressions",
  },
  {
    id: "r5",
    title: "Search results flash empty state",
    url: "app.acme.co/search?q=invoice",
    by: "Maya Chen",
    agoMs: 24 * 60 * 60_000,
    dur: "0:18",
    status: "triage",
    folder: "Q3 regressions",
  },
  {
    id: "r6",
    title: "Dark mode toggle resets on reload",
    url: "app.acme.co/preferences",
    by: "Leo Park",
    agoMs: 2 * 24 * 60 * 60_000,
    dur: "0:22",
    status: "done",
    folder: "Q3 regressions",
  },
  {
    id: "r7",
    title: "Invoice PDF missing tax line",
    url: "app.acme.co/billing/inv-2231",
    by: "Sara Ali",
    agoMs: 3 * 24 * 60 * 60_000,
    dur: "shot",
    status: "new",
    folder: "Checkout",
  },
  {
    id: "r8",
    title: "Date picker off by one day in Safari",
    url: "app.acme.co/bookings/new",
    by: "Dhiaz Fathra",
    agoMs: 4 * 24 * 60 * 60_000,
    dur: "0:37",
    status: "progress",
    folder: "Mobile web",
  },
] as const;

// Design's EV, all on the first Rewind (r1).
const EV = [
  { t: 0, k: "nav", txt: "Navigated to shop.acme.co/cart" },
  { t: 2, k: "click", txt: 'Clicked "Coupon code" field' },
  { t: 4, k: "net", txt: "GET /api/cart · 200 · 92ms" },
  { t: 7, k: "input", txt: 'Typed "SPRING25", clicked Apply' },
  { t: 9, k: "net", txt: "POST /api/coupon · 200 · 142ms" },
  { t: 12, k: "click", txt: 'Clicked "Checkout"' },
  {
    t: 14,
    k: "log",
    txt: 'checkout:start { items: 3, coupon: "SPRING25" }',
  },
  { t: 17, k: "net", txt: "POST /api/checkout · 500 · 1.2s", err: 1 },
  {
    t: 18,
    k: "err",
    txt: "TypeError: Cannot read properties of undefined (reading 'total')",
    err: 1,
  },
  { t: 21, k: "warn", txt: "Retrying payment intent (1/3)" },
  { t: 26, k: "click", txt: 'Clicked "Try again"' },
  { t: 28, k: "net", txt: "POST /api/checkout · 500 · 1.1s", err: 1 },
  { t: 34, k: "nav", txt: "Navigated to shop.acme.co/cart" },
] as const;

// Design's COMMENTS, also on r1.
const COMMENTS = [
  {
    t: 18,
    x: 70,
    y: 18,
    who: "Leo Park",
    txt: "This is the 500 from /api/checkout. Coupon object is null after apply.",
  },
  {
    t: 27,
    x: 78,
    y: 84,
    who: "Maya Chen",
    txt: "Try again hits the same error.",
  },
] as const;

/** "m:ss" -> whole seconds. */
function parseDuration(dur: string): number {
  const [m, s] = dur.split(":").map(Number);
  return m * 60 + s;
}

export type SeedRows = {
  folders: (typeof folders.$inferInsert)[];
  recordingLinks: (typeof recordingLinks.$inferInsert)[];
  rewinds: (typeof rewinds.$inferInsert)[];
  events: (typeof events.$inferInsert)[];
  comments: (typeof comments.$inferInsert)[];
};

/** Pure: builds the seed rows for a given "now". No I/O. */
export function buildSeedRows(now: Date): SeedRows {
  const folderRows = Object.entries(FOLDER_IDS).map(([name, id]) => ({
    id,
    name,
    createdAt: now,
  }));

  const linkRows = Object.entries(LINK_IDS).map(([name, id]) => ({
    id,
    name,
    createdAt: now,
  }));

  const rewindRows = JAMS.map((j) => {
    const isScreenshot = j.dur === "shot";
    return {
      id: `seed-${j.id}`,
      title: j.title,
      url: `https://${j.url}`,
      reporterName: j.by,
      status: j.status,
      kind: isScreenshot ? ("screenshot" as const) : ("video" as const),
      // Sample data only: no object exists in storage at this key (seed has
      // no S3 dependency), so the viewer must render a missing-media state
      // for seeded Rewinds.
      mediaKey: `rewinds/seed-${j.id}.${isScreenshot ? "png" : "webm"}`,
      durationSeconds: isScreenshot ? null : parseDuration(j.dur),
      folderId: FOLDER_IDS[j.folder],
      recordingLinkId: null,
      createdAt: new Date(now.getTime() - j.agoMs),
      updatedAt: new Date(now.getTime() - j.agoMs),
    };
  });

  const eventRows = EV.map((e, i) => ({
    id: `seed-r1-ev-${String(i).padStart(2, "0")}`,
    rewindId: "seed-r1",
    t: e.t,
    kind: e.k,
    text: e.txt,
    isError: "err" in e && e.err === 1,
  }));

  const commentRows = COMMENTS.map((c, i) => ({
    id: `seed-r1-comment-${String(i).padStart(2, "0")}`,
    rewindId: "seed-r1",
    t: c.t,
    x: c.x,
    y: c.y,
    author: c.who,
    text: c.txt,
    createdAt: now,
  }));

  return {
    folders: folderRows,
    recordingLinks: linkRows,
    rewinds: rewindRows,
    events: eventRows,
    comments: commentRows,
  };
}

/**
 * Idempotent: inserts any missing seed rows by their fixed ids, in one batch.
 *
 * Insert-if-missing (not delete-then-insert, not update-on-conflict) so
 * re-seeding only restores deleted sample rows. It never cascades away
 * user-added comments/events, nulls out user Rewinds' folderId, or reverts
 * user edits to seeded rows.
 */
export async function seed(db: Db, now: Date): Promise<void> {
  const rows = buildSeedRows(now);

  await db.batch([
    db
      .insert(folders)
      .values(rows.folders)
      .onConflictDoNothing({ target: folders.id }),
    db
      .insert(recordingLinks)
      .values(rows.recordingLinks)
      .onConflictDoNothing({ target: recordingLinks.id }),
    db
      .insert(rewinds)
      .values(rows.rewinds)
      .onConflictDoNothing({ target: rewinds.id }),
    db
      .insert(events)
      .values(rows.events)
      .onConflictDoNothing({ target: events.id }),
    db
      .insert(comments)
      .values(rows.comments)
      .onConflictDoNothing({ target: comments.id }),
  ]);
}

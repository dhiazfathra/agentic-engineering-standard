import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { errorSignature } from "@/lib/signature";
import { hashPassword } from "@/lib/password";
import {
  comments,
  DEFAULT_WORKSPACE_ID,
  events,
  folders,
  integrations,
  memberships,
  recordingLinks,
  rewinds,
  users,
  workspaces,
} from "./schema";
import type * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;

// Seeded login for local dev and e2e: dhiazfathra@gmail.com / rewind-dev,
// Admin of the default workspace (which seeded Rewinds already belong to).
export const SEED_USER_ID = "seed-user-admin";
export const SEED_USER_EMAIL = "dhiazfathra@gmail.com";
export const SEED_USER_PASSWORD = "rewind-dev";

// SPEC-design-parity.md § Seed: the default workspace's design name and
// invite code. The migration (drizzle/0003_accounts_workspaces.sql) inserts
// the row named "Default Workspace" before this workspace exists; seed()
// renames it once, only while it still has that migration default name, so
// a later user rename sticks across re-seeds.
export const SEED_WORKSPACE_NAME = "Dhiaz's Workspace";
const SEED_WORKSPACE_INVITE_CODE = "RsSg6prV8T8";
const MIGRATION_DEFAULT_WORKSPACE_NAME = "Default Workspace";

// Design's other members, all password rewind-dev.
const MEMBERS = [
  {
    id: "seed-user-maya",
    email: "maya@acme.co",
    firstName: "Maya",
    lastName: "Chen",
    role: "Creator",
  },
  {
    id: "seed-user-leo",
    email: "leo@acme.co",
    firstName: "Leo",
    lastName: "Park",
    role: "Creator",
  },
  {
    id: "seed-user-sara",
    email: "sara@acme.co",
    firstName: "Sara",
    lastName: "Ali",
    role: "Viewer",
  },
] as const;

const MEMBER_PASSWORD = "rewind-dev";

// Design's connected integrations.
const INTEGRATIONS = ["Linear", "Slack"] as const;

// A mix of distinct errors for the recording-link filler Rewinds, so each
// link's Rewinds group into more than one errorSignature.
const FILLER_ERRORS = [
  "TypeError: Cannot read properties of null (reading 'items')",
  "ReferenceError: total is not defined",
  "RangeError: Invalid array length",
  "TypeError: fetch failed",
  "SyntaxError: Unexpected token < in JSON at position 0",
] as const;

const FOLDER_IDS = {
  Checkout: "seed-folder-checkout",
  "Mobile web": "seed-folder-mobile-web",
  "Q3 regressions": "seed-folder-q3-regressions",
} as const;

const LINK_IDS = {
  "Support: checkout issues": "seed-link-support-checkout",
  "Beta testers": "seed-link-beta-testers",
} as const;

// Design's recording-link recording counts (SPEC-design-parity.md § Seed).
// JAMS below supplies 4 Rewinds per link; buildFillerRows tops each up.
const LINK_TARGET_COUNTS: Record<keyof typeof LINK_IDS, number> = {
  "Support: checkout issues": 6,
  "Beta testers": 14,
};

// Design's JAMS, from docs/design/Rewind.dc.html. `link` assigns each to
// the recording link it came through (SPEC-design-parity.md § Seed).
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
    link: "Support: checkout issues",
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
    link: "Support: checkout issues",
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
    link: "Support: checkout issues",
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
    link: "Beta testers",
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
    link: "Beta testers",
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
    link: "Beta testers",
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
    link: "Support: checkout issues",
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
    link: "Beta testers",
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

/**
 * Filler Rewinds so a recording link reaches its design recording count
 * (LINK_TARGET_COUNTS), each with one error event so it gets a real
 * errorSignature. Cycling FILLER_ERRORS gives each link a mix of
 * signatures, not one big group.
 */
function buildFillerRows(
  linkName: keyof typeof LINK_IDS,
  slug: string,
  need: number,
  now: Date,
): { rewinds: (typeof rewinds.$inferInsert)[]; events: (typeof events.$inferInsert)[] } {
  const reporters = ["Maya Chen", "Leo Park", "Sara Ali", "Dhiaz Fathra"] as const;
  const rewindRows: (typeof rewinds.$inferInsert)[] = [];
  const eventRows: (typeof events.$inferInsert)[] = [];

  for (let i = 0; i < need; i++) {
    const id = `seed-link-${slug}-f${i + 1}`;
    const errorText = FILLER_ERRORS[i % FILLER_ERRORS.length];
    // Older than the JAMS rows (oldest is r8, 4 days) so newest-first lists
    // put the design's named Rewinds first.
    const agoMs = (9 + i) * 24 * 60 * 60_000;

    rewindRows.push({
      id,
      title: `Filler bug ${i + 1}`,
      url: "https://app.acme.co/filler",
      reporterName: reporters[i % reporters.length],
      status: "new",
      kind: "video",
      mediaKey: `rewinds/${id}.webm`,
      durationSeconds: 15,
      folderId: null,
      recordingLinkId: LINK_IDS[linkName],
      errorSignature: errorSignature([{ text: errorText, isError: true }]),
      createdAt: new Date(now.getTime() - agoMs),
      updatedAt: new Date(now.getTime() - agoMs),
    });
    eventRows.push({
      id: `${id}-ev-00`,
      rewindId: id,
      t: 0,
      kind: "err",
      text: errorText,
      isError: true,
    });
  }

  return { rewinds: rewindRows, events: eventRows };
}

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

  const r1Events = EV.map((e, i) => ({
    id: `seed-r1-ev-${String(i).padStart(2, "0")}`,
    rewindId: "seed-r1",
    t: e.t,
    kind: e.k,
    text: e.txt,
    isError: "err" in e && e.err === 1,
  }));

  // r2 and r3 get r1's first error event, so all three group under one
  // errorSignature (SPEC-design-parity.md § Decisions #3).
  const groupedErrorEvent = EV.find((e) => "err" in e && e.err === 1)!;
  const r2Events = [
    {
      id: "seed-r2-ev-00",
      rewindId: "seed-r2",
      t: 0,
      kind: groupedErrorEvent.k,
      text: groupedErrorEvent.txt,
      isError: true,
    },
  ];
  const r3Events = [
    {
      id: "seed-r3-ev-00",
      rewindId: "seed-r3",
      t: 0,
      kind: groupedErrorEvent.k,
      text: groupedErrorEvent.txt,
      isError: true,
    },
  ];
  type SeedEvent = { text: string; isError: boolean };
  const eventsByRewindId: Record<string, SeedEvent[]> = {
    "seed-r1": r1Events,
    "seed-r2": r2Events,
    "seed-r3": r3Events,
  };

  const rewindRows = JAMS.map((j) => {
    const isScreenshot = j.dur === "shot";
    const id = `seed-${j.id}`;
    const ownEvents = eventsByRewindId[id] ?? [];
    return {
      id,
      title: j.title,
      url: `https://${j.url}`,
      reporterName: j.by,
      status: j.status,
      kind: isScreenshot ? ("screenshot" as const) : ("video" as const),
      // Sample data only: no object exists in storage at this key (seed has
      // no S3 dependency), so the viewer must render a missing-media state
      // for seeded Rewinds.
      mediaKey: `rewinds/${id}.${isScreenshot ? "png" : "webm"}`,
      durationSeconds: isScreenshot ? null : parseDuration(j.dur),
      folderId: FOLDER_IDS[j.folder],
      recordingLinkId: LINK_IDS[j.link],
      errorSignature: errorSignature(ownEvents),
      createdAt: new Date(now.getTime() - j.agoMs),
      updatedAt: new Date(now.getTime() - j.agoMs),
    };
  });

  function jamsCountForLink(linkName: keyof typeof LINK_IDS): number {
    return JAMS.filter((j) => j.link === linkName).length;
  }

  const checkoutFiller = buildFillerRows(
    "Support: checkout issues",
    "checkout",
    LINK_TARGET_COUNTS["Support: checkout issues"] -
      jamsCountForLink("Support: checkout issues"),
    now,
  );
  const betaFiller = buildFillerRows(
    "Beta testers",
    "beta",
    LINK_TARGET_COUNTS["Beta testers"] - jamsCountForLink("Beta testers"),
    now,
  );

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
    rewinds: [...rewindRows, ...checkoutFiller.rewinds, ...betaFiller.rewinds],
    events: [...r1Events, ...r2Events, ...r3Events, ...checkoutFiller.events, ...betaFiller.events],
    comments: commentRows,
  };
}

/**
 * Idempotent: inserts any missing seed rows by their fixed ids, in one batch.
 *
 * Insert-if-missing (not delete-then-insert, not update-on-conflict) so
 * re-seeding only restores deleted sample rows. It never cascades away
 * user-added comments/events, nulls out user Rewinds' folderId, or reverts
 * user edits to seeded rows. The one exception is the default workspace's
 * name/invite code, which seed() renames once (see SEED_WORKSPACE_NAME
 * above) — guarded so it never overwrites a later user rename.
 */
export async function seed(db: Db, now: Date): Promise<void> {
  const rows = buildSeedRows(now);

  await db.batch([
    db
      .insert(users)
      .values({
        id: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        passwordHash: hashPassword(SEED_USER_PASSWORD),
        firstName: "Dhiaz",
        lastName: "Fathra",
        createdAt: now,
      })
      .onConflictDoNothing({ target: users.id }),
    db
      .insert(memberships)
      .values({
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId: SEED_USER_ID,
        role: "Admin",
        lastActiveAt: now,
      })
      .onConflictDoNothing({
        target: [memberships.workspaceId, memberships.userId],
      }),
    ...MEMBERS.flatMap((m) => [
      db
        .insert(users)
        .values({
          id: m.id,
          email: m.email,
          passwordHash: hashPassword(MEMBER_PASSWORD),
          firstName: m.firstName,
          lastName: m.lastName,
          createdAt: now,
        })
        .onConflictDoNothing({ target: users.id }),
      db
        .insert(memberships)
        .values({
          workspaceId: DEFAULT_WORKSPACE_ID,
          userId: m.id,
          role: m.role,
          lastActiveAt: now,
        })
        .onConflictDoNothing({
          target: [memberships.workspaceId, memberships.userId],
        }),
    ]),
    ...INTEGRATIONS.map((name) =>
      db
        .insert(integrations)
        .values({ workspaceId: DEFAULT_WORKSPACE_ID, name, connectedAt: now })
        .onConflictDoNothing({ target: [integrations.workspaceId, integrations.name] }),
    ),
    db
      .update(workspaces)
      .set({ name: SEED_WORKSPACE_NAME, inviteCode: SEED_WORKSPACE_INVITE_CODE })
      .where(
        and(
          eq(workspaces.id, DEFAULT_WORKSPACE_ID),
          eq(workspaces.name, MIGRATION_DEFAULT_WORKSPACE_NAME),
        ),
      ),
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

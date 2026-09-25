import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/password";
import * as schema from "./schema";
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
import {
  buildSeedRows,
  seed,
  SEED_USER_EMAIL,
  SEED_USER_ID,
  SEED_USER_PASSWORD,
  SEED_WORKSPACE_NAME,
} from "./seed";

describe("buildSeedRows", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");
  const rows = buildSeedRows(now);

  it("builds the design's 3 folders, 2 recording links, 20 rewinds, 27 events, 2 comments", () => {
    expect(rows.folders).toHaveLength(3);
    expect(rows.recordingLinks).toHaveLength(2);
    expect(rows.rewinds).toHaveLength(20);
    expect(rows.events).toHaveLength(27);
    expect(rows.comments).toHaveLength(2);
  });

  it("gives each recording link its design recording count", () => {
    const checkout = rows.rewinds.filter(
      (r) => r.recordingLinkId === "seed-link-support-checkout",
    );
    const beta = rows.rewinds.filter(
      (r) => r.recordingLinkId === "seed-link-beta-testers",
    );
    expect(checkout).toHaveLength(6);
    expect(beta).toHaveLength(14);
  });

  it("groups r1, r2 and r3 under the same errorSignature", () => {
    const r1 = rows.rewinds.find((r) => r.id === "seed-r1");
    const r2 = rows.rewinds.find((r) => r.id === "seed-r2");
    const r3 = rows.rewinds.find((r) => r.id === "seed-r3");
    expect(r1?.errorSignature).not.toBeNull();
    expect(r2?.errorSignature).toBe(r1?.errorSignature);
    expect(r3?.errorSignature).toBe(r1?.errorSignature);
  });

  it("gives each link's filler Rewinds a mix of errorSignatures", () => {
    const fillerSignatures = new Set(
      rows.rewinds
        .filter((r) => r.id?.startsWith("seed-link-beta-f"))
        .map((r) => r.errorSignature),
    );
    expect(fillerSignatures.size).toBeGreaterThan(1);
  });

  it("gives every row a fixed, stable id across calls", () => {
    const again = buildSeedRows(now);
    expect(rows.folders.map((r) => r.id)).toEqual(
      again.folders.map((r) => r.id),
    );
    expect(rows.rewinds.map((r) => r.id)).toEqual(
      again.rewinds.map((r) => r.id),
    );
    expect(rows.rewinds[0].id).toBe("seed-r1");
    expect(rows.folders[0].id).toBe("seed-folder-checkout");
  });

  it("parses m:ss durations into whole seconds for videos", () => {
    const r1 = rows.rewinds.find((r) => r.id === "seed-r1");
    expect(r1?.durationSeconds).toBe(42);
    expect(r1?.kind).toBe("video");
  });

  it("gives screenshots a null duration and kind screenshot", () => {
    const r4 = rows.rewinds.find((r) => r.id === "seed-r4");
    expect(r4?.kind).toBe("screenshot");
    expect(r4?.durationSeconds).toBeNull();
    expect(r4?.mediaKey).toBe("rewinds/seed-r4.png");
  });

  it("backdates createdAt from the ago offset relative to now", () => {
    const r1 = rows.rewinds.find((r) => r.id === "seed-r1");
    expect((r1?.createdAt as Date).getTime()).toBe(now.getTime() - 12 * 60_000);
  });

  it("attaches every comment, and r1's own events, to the first rewind", () => {
    expect(
      rows.events.filter((e) => e.rewindId === "seed-r1"),
    ).toHaveLength(13);
    expect(rows.comments.every((c) => c.rewindId === "seed-r1")).toBe(true);
  });

  it("gives every error/filler event isError: true", () => {
    // r1's 3 (network + err lines) + r2 + r3 + 2 checkout filler + 10 beta
    // filler, each with exactly one isError event.
    const errorEvents = rows.events.filter((e) => e.isError);
    expect(errorEvents).toHaveLength(17);
  });
});

describe("seed", () => {
  const dbFile = join(mkdtempSync(join(tmpdir(), "rewind-seed-")), "test.db");
  const client = createClient({ url: `file:${dbFile}` });
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(() => {
    client.close();
  });

  it("inserts the design's sample rows", async () => {
    await seed(db, new Date());
    expect(await db.select().from(folders)).toHaveLength(3);
    expect(await db.select().from(recordingLinks)).toHaveLength(2);
    expect(await db.select().from(rewinds)).toHaveLength(20);
    expect(await db.select().from(events)).toHaveLength(27);
    expect(await db.select().from(comments)).toHaveLength(2);
    expect(await db.select().from(users)).toHaveLength(4);
    expect(await db.select().from(memberships)).toHaveLength(4);
    expect(await db.select().from(integrations)).toHaveLength(2);
  });

  it("is idempotent: running it again leaves the same row counts", async () => {
    await seed(db, new Date());
    await seed(db, new Date());
    expect(await db.select().from(folders)).toHaveLength(3);
    expect(await db.select().from(recordingLinks)).toHaveLength(2);
    expect(await db.select().from(rewinds)).toHaveLength(20);
    expect(await db.select().from(events)).toHaveLength(27);
    expect(await db.select().from(comments)).toHaveLength(2);
    expect(await db.select().from(users)).toHaveLength(4);
    expect(await db.select().from(memberships)).toHaveLength(4);
    expect(await db.select().from(integrations)).toHaveLength(2);
  });

  it("seeds the admin login as an Admin of the default workspace", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, SEED_USER_ID),
    });
    expect(user?.email).toBe(SEED_USER_EMAIL);
    expect(verifyPassword(SEED_USER_PASSWORD, user!.passwordHash)).toBe(true);

    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.workspaceId, DEFAULT_WORKSPACE_ID),
        eq(memberships.userId, SEED_USER_ID),
      ),
    });
    expect(membership?.role).toBe("Admin");

    await seed(db, new Date());
    expect(await db.select().from(users)).toHaveLength(4);
  });

  it("seeds Maya, Leo and Sara as Creator/Creator/Viewer members", async () => {
    const maya = await db.query.memberships.findFirst({
      where: eq(memberships.userId, "seed-user-maya"),
    });
    const leo = await db.query.memberships.findFirst({
      where: eq(memberships.userId, "seed-user-leo"),
    });
    const sara = await db.query.memberships.findFirst({
      where: eq(memberships.userId, "seed-user-sara"),
    });
    expect(maya?.role).toBe("Creator");
    expect(leo?.role).toBe("Creator");
    expect(sara?.role).toBe("Viewer");
  });

  it("connects Linear and Slack in the default workspace", async () => {
    const rows = await db
      .select()
      .from(integrations)
      .where(eq(integrations.workspaceId, DEFAULT_WORKSPACE_ID));
    expect(rows.map((r) => r.name).sort()).toEqual(["Linear", "Slack"]);
  });

  it("renames the default workspace and sets its invite code", async () => {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, DEFAULT_WORKSPACE_ID),
    });
    expect(workspace?.name).toBe(SEED_WORKSPACE_NAME);
    expect(workspace?.inviteCode).toBe("RsSg6prV8T8");
  });

  it("never reverts a user's rename of the default workspace", async () => {
    await db
      .update(workspaces)
      .set({ name: "Renamed by user" })
      .where(eq(workspaces.id, DEFAULT_WORKSPACE_ID));

    await seed(db, new Date());

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, DEFAULT_WORKSPACE_ID),
    });
    expect(workspace?.name).toBe("Renamed by user");

    // Restore for the tests below.
    await db
      .update(workspaces)
      .set({ name: SEED_WORKSPACE_NAME })
      .where(eq(workspaces.id, DEFAULT_WORKSPACE_ID));
  });

  it("loads the r1 rewind with its events and comments through relations", async () => {
    const found = await db.query.rewinds.findFirst({
      where: and(eq(rewinds.id, "seed-r1")),
      with: { events: true, comments: true },
    });
    expect(found?.events).toHaveLength(13);
    expect(found?.comments).toHaveLength(2);
  });

  it("re-seeding keeps user-added rows and doesn't null out user data", async () => {
    async function rowCounts() {
      return {
        folders: (await db.select().from(folders)).length,
        recordingLinks: (await db.select().from(recordingLinks)).length,
        rewinds: (await db.select().from(rewinds)).length,
        events: (await db.select().from(events)).length,
        comments: (await db.select().from(comments)).length,
      };
    }

    await seed(db, new Date());
    const before = await rowCounts();

    await db.insert(comments).values({
      id: "user-comment-on-seed-r1",
      rewindId: "seed-r1",
      t: 1,
      x: 0,
      y: 0,
      author: "user",
      text: "user comment",
      createdAt: new Date(),
    });
    await db.insert(rewinds).values({
      id: "user-rewind-in-seed-folder",
      title: "user rewind",
      url: "https://example.com",
      reporterName: "user",
      kind: "video",
      mediaKey: "rewinds/user-rewind.webm",
      durationSeconds: 1,
      folderId: "seed-folder-checkout",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await seed(db, new Date());
    const after = await rowCounts();

    // Seed row counts are unchanged; only the two user-added rows are extra.
    expect(after).toEqual({
      ...before,
      rewinds: before.rewinds + 1,
      comments: before.comments + 1,
    });

    const userComment = await db.query.comments.findFirst({
      where: eq(comments.id, "user-comment-on-seed-r1"),
    });
    expect(userComment).toBeDefined();

    const userRewind = await db.query.rewinds.findFirst({
      where: eq(rewinds.id, "user-rewind-in-seed-folder"),
    });
    expect(userRewind?.folderId).toBe("seed-folder-checkout");
  });
});

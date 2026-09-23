import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { comments, events, folders, recordingLinks, rewinds } from "./schema";
import { buildSeedRows, seed } from "./seed";

describe("buildSeedRows", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");
  const rows = buildSeedRows(now);

  it("builds the design's 3 folders, 2 recording links, 8 rewinds, 13 events, 2 comments", () => {
    expect(rows.folders).toHaveLength(3);
    expect(rows.recordingLinks).toHaveLength(2);
    expect(rows.rewinds).toHaveLength(8);
    expect(rows.events).toHaveLength(13);
    expect(rows.comments).toHaveLength(2);
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

  it("attaches every event and comment to the first rewind", () => {
    expect(rows.events.every((e) => e.rewindId === "seed-r1")).toBe(true);
    expect(rows.comments.every((c) => c.rewindId === "seed-r1")).toBe(true);
  });

  it("marks the network and error events with err:1 as isError", () => {
    const errorEvents = rows.events.filter((e) => e.isError);
    expect(errorEvents).toHaveLength(3);
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
    expect(await db.select().from(rewinds)).toHaveLength(8);
    expect(await db.select().from(events)).toHaveLength(13);
    expect(await db.select().from(comments)).toHaveLength(2);
  });

  it("is idempotent: running it again leaves the same row counts", async () => {
    await seed(db, new Date());
    await seed(db, new Date());
    expect(await db.select().from(folders)).toHaveLength(3);
    expect(await db.select().from(recordingLinks)).toHaveLength(2);
    expect(await db.select().from(rewinds)).toHaveLength(8);
    expect(await db.select().from(events)).toHaveLength(13);
    expect(await db.select().from(comments)).toHaveLength(2);
  });

  it("loads the r1 rewind with its events and comments through relations", async () => {
    const found = await db.query.rewinds.findFirst({
      where: and(eq(rewinds.id, "seed-r1")),
      with: { events: true, comments: true },
    });
    expect(found?.events).toHaveLength(13);
    expect(found?.comments).toHaveLength(2);
  });
});

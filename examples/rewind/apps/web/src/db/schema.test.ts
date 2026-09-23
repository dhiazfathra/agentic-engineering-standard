import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { comments, events, folders, recordingLinks, rewinds } from "./schema";

// :memory: gives libSQL a fresh DB per connection, so use a temp file.
const dbFile = join(mkdtempSync(join(tmpdir(), "rewind-db-")), "test.db");
const client = createClient({ url: `file:${dbFile}` });
const db = drizzle(client, { schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

afterAll(() => {
  client.close();
});

describe("foreign keys", () => {
  it("cascades events and comments when their Rewind is deleted", async () => {
    const [folder] = await db
      .insert(folders)
      .values({ name: "Bugs" })
      .returning();
    const [rewind] = await db
      .insert(rewinds)
      .values({
        title: "Bug",
        url: "https://example.com",
        reporterName: "Sam",
        kind: "screenshot",
        mediaKey: "rewinds/x.png",
        folderId: folder.id,
      })
      .returning();
    await db.insert(events).values({
      rewindId: rewind.id,
      t: 0,
      kind: "log",
      text: "hi",
      isError: false,
    });
    await db.insert(comments).values({
      rewindId: rewind.id,
      t: 0,
      x: 1,
      y: 1,
      author: "Sam",
      text: "hi",
    });

    await db.delete(rewinds).where(eq(rewinds.id, rewind.id));

    expect(
      await db.select().from(events).where(eq(events.rewindId, rewind.id)),
    ).toEqual([]);
    expect(
      await db.select().from(comments).where(eq(comments.rewindId, rewind.id)),
    ).toEqual([]);
  });

  it("sets folderId to null when its folder is deleted, keeping the Rewind", async () => {
    const [folder] = await db
      .insert(folders)
      .values({ name: "Triage" })
      .returning();
    const [rewind] = await db
      .insert(rewinds)
      .values({
        title: "Bug",
        url: "https://example.com",
        reporterName: "Sam",
        kind: "screenshot",
        mediaKey: "rewinds/y.png",
        folderId: folder.id,
      })
      .returning();

    await db.delete(folders).where(eq(folders.id, folder.id));

    const [after] = await db
      .select()
      .from(rewinds)
      .where(eq(rewinds.id, rewind.id));
    expect(after).toBeDefined();
    expect(after.folderId).toBeNull();
  });

  it("sets recordingLinkId to null when its recording link is deleted", async () => {
    const [link] = await db
      .insert(recordingLinks)
      .values({ name: "Sprint demo" })
      .returning();
    const [rewind] = await db
      .insert(rewinds)
      .values({
        title: "Bug",
        url: "https://example.com",
        reporterName: "Sam",
        kind: "screenshot",
        mediaKey: "rewinds/w.png",
        recordingLinkId: link.id,
      })
      .returning();

    await db.delete(recordingLinks).where(eq(recordingLinks.id, link.id));

    const [after] = await db
      .select()
      .from(rewinds)
      .where(eq(rewinds.id, rewind.id));
    expect(after.recordingLinkId).toBeNull();
  });
});

describe("foreign key targets", () => {
  it("points rewinds, events, and comments FKs at the right tables", () => {
    const rewindsFks = getTableConfig(rewinds).foreignKeys;
    const targets = rewindsFks.map((fk) => fk.reference().foreignTable);
    expect(targets).toContain(folders);
    expect(targets).toContain(recordingLinks);

    expect(
      getTableConfig(events).foreignKeys[0]?.reference().foreignTable,
    ).toBe(rewinds);
    expect(
      getTableConfig(comments).foreignKeys[0]?.reference().foreignTable,
    ).toBe(rewinds);
  });
});

describe("relations", () => {
  it("loads a Rewind with its events and comments", async () => {
    const [rewind] = await db
      .insert(rewinds)
      .values({
        title: "With relations",
        url: "https://example.com",
        reporterName: "Sam",
        kind: "screenshot",
        mediaKey: "rewinds/z.png",
      })
      .returning();
    await db.insert(events).values({
      rewindId: rewind.id,
      t: 0,
      kind: "log",
      text: "hi",
      isError: false,
    });
    await db.insert(comments).values({
      rewindId: rewind.id,
      t: 0,
      x: 1,
      y: 1,
      author: "Sam",
      text: "hi",
    });

    const found = await db.query.rewinds.findFirst({
      where: eq(rewinds.id, rewind.id),
      with: { events: true, comments: true },
    });

    expect(found?.events).toHaveLength(1);
    expect(found?.comments).toHaveLength(1);
  });
});

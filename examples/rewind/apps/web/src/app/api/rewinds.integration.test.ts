// Drives the real route handlers against a migrated temp `file:` database.
// No mocking of @/lib/db: this proves the handlers, schema, and cascades
// actually work together (spec success criteria 1-5).
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const dbFile = join(mkdtempSync(join(tmpdir(), "rewind-api-")), "test.db");
vi.stubEnv("DATABASE_URL", `file:${dbFile}`);

const s3Send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({ s3: { send: s3Send } }));

const { db } = await import("@/lib/db");
const rewindsRoute = await import("./rewinds/route");
const rewindIdRoute = await import("./rewinds/[id]/route");
const commentsRoute = await import("./rewinds/[id]/comments/route");
const foldersRoute = await import("./folders/route");
const folderIdRoute = await import("./folders/[id]/route");
const linksRoute = await import("./recording-links/route");
const { seed } = await import("@/db/seed");

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

describe("rewinds API against a real database", () => {
  it("drives folder, recording-link, and rewind CRUD end to end", async () => {
    // Folder + recording link
    const folderRes = await foldersRoute.POST(
      jsonRequest("http://localhost/api/folders", "POST", { name: "Bugs" }),
    );
    expect(folderRes.status).toBe(201);
    const folder = await folderRes.json();

    const linkRes = await linksRoute.POST(
      jsonRequest("http://localhost/api/recording-links", "POST", {
        name: "Sprint demo",
      }),
    );
    expect(linkRes.status).toBe(201);
    const link = await linkRes.json();

    const linkListRes = await linksRoute.GET();
    expect(linkListRes.status).toBe(200);
    expect(await linkListRes.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: link.id })]),
    );

    // Create a rewind with events
    const createRes = await rewindsRoute.POST(
      jsonRequest("http://localhost/api/rewinds", "POST", {
        title: "Checkout fails",
        url: "https://example.com/cart",
        reporterName: "Sam",
        kind: "video",
        mediaKey: `rewinds/${"a".repeat(21)}.webm`,
        durationSeconds: 12,
        folderId: folder.id,
        recordingLinkId: link.id,
        events: [
          { t: 2, kind: "click", text: "clicked", isError: false },
          { t: 1, kind: "nav", text: "navigated", isError: false },
        ],
      }),
    );
    expect(createRes.status).toBe(201);
    const rewind = await createRes.json();

    // A second rewind reusing the same mediaKey is rejected
    const dupRes = await rewindsRoute.POST(
      jsonRequest("http://localhost/api/rewinds", "POST", {
        title: "Duplicate media",
        url: "https://example.com/cart",
        reporterName: "Sam",
        kind: "video",
        mediaKey: `rewinds/${"a".repeat(21)}.webm`,
        durationSeconds: 5,
        events: [],
      }),
    );
    expect(dupRes.status).toBe(409);
    expect(await dupRes.json()).toEqual({ error: "mediaKey already used" });

    // List
    const listRes = await rewindsRoute.GET();
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.map((r: { id: string }) => r.id)).toContain(rewind.id);

    // Get with events sorted by t
    const params = Promise.resolve({ id: rewind.id as string });
    const getRes = await rewindIdRoute.GET(new Request("http://localhost"), {
      params,
    });
    expect(getRes.status).toBe(200);
    const withEvents = await getRes.json();
    expect(withEvents.events.map((e: { t: number }) => e.t)).toEqual([1, 2]);
    expect(withEvents.comments).toEqual([]);

    // Add a comment
    const commentRes = await commentsRoute.POST(
      jsonRequest(
        `http://localhost/api/rewinds/${rewind.id}/comments`,
        "POST",
        { t: 1, x: 10, y: 10, author: "Sam", text: "look here" },
      ),
      { params },
    );
    expect(commentRes.status).toBe(201);

    // Patch title/status/folderId
    const patchRes = await rewindIdRoute.PATCH(
      jsonRequest(`http://localhost/api/rewinds/${rewind.id}`, "PATCH", {
        title: "Checkout fails after coupon",
        status: "triage",
      }),
      { params },
    );
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.title).toBe("Checkout fails after coupon");
    expect(patched.status).toBe("triage");

    // Delete the folder: rewind's folderId becomes null
    const folderParams = Promise.resolve({ id: folder.id as string });
    const deleteFolderRes = await folderIdRoute.DELETE(
      new Request("http://localhost"),
      { params: folderParams },
    );
    expect(deleteFolderRes.status).toBe(200);

    const afterFolderDeleteRes = await rewindIdRoute.GET(
      new Request("http://localhost"),
      { params },
    );
    expect((await afterFolderDeleteRes.json()).folderId).toBeNull();

    // Delete the rewind: storage delete rejects, still returns 200
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    s3Send.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const deleteRes = await rewindIdRoute.DELETE(
      new Request("http://localhost"),
      { params },
    );
    expect(deleteRes.status).toBe(200);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();

    // Get now 404s, events/comments gone
    const afterDeleteRes = await rewindIdRoute.GET(
      new Request("http://localhost"),
      { params },
    );
    expect(afterDeleteRes.status).toBe(404);

    const remainingEvents = await db.query.events.findMany();
    const remainingComments = await db.query.comments.findMany();
    expect(remainingEvents.some((e) => e.rewindId === rewind.id)).toBe(false);
    expect(remainingComments.some((c) => c.rewindId === rewind.id)).toBe(false);
  });

  it("stores every event when a rewind carries the maximum 10,000", async () => {
    const res = await rewindsRoute.POST(
      jsonRequest("http://localhost/api/rewinds", "POST", {
        title: "Long session",
        url: "https://example.com/",
        reporterName: "Sam",
        kind: "video",
        mediaKey: `rewinds/${"b".repeat(21)}.webm`,
        durationSeconds: 600,
        events: Array.from({ length: 10_000 }, (_, t) => ({
          t,
          kind: "click",
          text: `click ${t}`,
          isError: false,
        })),
      }),
    );
    expect(res.status).toBe(201);
    const rewind = await res.json();

    const stored = await db.query.events.findMany({
      where: (e, { eq }) => eq(e.rewindId, rewind.id),
    });
    expect(stored).toHaveLength(10_000);
  });

  it("404s a comment on an unknown rewind", async () => {
    const res = await commentsRoute.POST(
      jsonRequest("http://localhost/api/rewinds/nope/comments", "POST", {
        t: 1,
        x: 10,
        y: 10,
        author: "Sam",
        text: "orphan",
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });

  it("400s a PATCH with an unknown folderId", async () => {
    const createRes = await rewindsRoute.POST(
      jsonRequest("http://localhost/api/rewinds", "POST", {
        title: "Patch target",
        url: "https://example.com/",
        reporterName: "Sam",
        kind: "video",
        mediaKey: `rewinds/${"c".repeat(21)}.webm`,
        durationSeconds: 1,
        events: [],
      }),
    );
    const rewind = await createRes.json();
    const res = await rewindIdRoute.PATCH(
      jsonRequest(`http://localhost/api/rewinds/${rewind.id}`, "PATCH", {
        folderId: "nope",
      }),
      { params: Promise.resolve({ id: rewind.id as string }) },
    );
    expect(res.status).toBe(400);
  });

  it("re-seeding keeps user edits to seeded rows", async () => {
    await seed(db, new Date("2026-01-01T00:00:00.000Z"));

    const patchRes = await rewindIdRoute.PATCH(
      jsonRequest("http://localhost/api/rewinds/seed-r1", "PATCH", {
        status: "done",
        folderId: null,
      }),
      { params: Promise.resolve({ id: "seed-r1" }) },
    );
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();

    const renameRes = await folderIdRoute.PATCH(
      jsonRequest(
        "http://localhost/api/folders/seed-folder-checkout",
        "PATCH",
        {
          name: "Renamed",
        },
      ),
      { params: Promise.resolve({ id: "seed-folder-checkout" }) },
    );
    expect(renameRes.status).toBe(200);

    await seed(db, new Date("2026-06-01T00:00:00.000Z"));

    const getRes = await rewindIdRoute.GET(
      jsonRequest("http://localhost/api/rewinds/seed-r1", "GET"),
      { params: Promise.resolve({ id: "seed-r1" }) },
    );
    const after = await getRes.json();
    expect(after).toMatchObject({
      status: "done",
      folderId: null,
      createdAt: patched.createdAt,
      updatedAt: patched.updatedAt,
    });

    const folderList = await (await foldersRoute.GET()).json();
    expect(folderList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "seed-folder-checkout",
          name: "Renamed",
        }),
      ]),
    );
  });
});

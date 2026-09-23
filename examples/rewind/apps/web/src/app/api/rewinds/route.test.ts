import { beforeEach, describe, expect, it, vi } from "vitest";

// A minimal fluent builder mock: every method returns itself except the
// terminal one, which resolves to the given value.
function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  insert: vi.fn(),
  batch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { rewinds: { findMany: mocks.findMany } },
    insert: mocks.insert,
    batch: mocks.batch,
  },
}));

import { GET, POST } from "./route";

const row = {
  id: "r1",
  title: "Bug",
  url: "https://x",
  reporterName: "A",
  status: "new",
  kind: "screenshot",
  mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.png",
  durationSeconds: null,
  folderId: null,
  recordingLinkId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const request = (body: unknown) =>
  new Request("http://localhost/api/rewinds", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("GET /api/rewinds", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists rewinds newest first", async () => {
    mocks.findMany.mockResolvedValue([row]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    ]);
  });
});

describe("POST /api/rewinds", () => {
  beforeEach(() => vi.resetAllMocks());

  const validBody = {
    title: "Bug",
    url: "https://x",
    reporterName: "A",
    kind: "screenshot",
    mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.png",
    events: [{ t: 1, kind: "click", text: "clicked", isError: false }],
  };

  it("creates a rewind and its events in one batch", async () => {
    mocks.insert.mockReturnValue(chain(undefined));
    mocks.batch.mockResolvedValue([[row]]);
    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
    expect(mocks.batch).toHaveBeenCalledWith(
      expect.arrayContaining([expect.anything(), expect.anything()]),
    );
  });

  it("batches only the rewind insert when there are no events", async () => {
    mocks.insert.mockReturnValue(chain(undefined));
    mocks.batch.mockResolvedValue([[row]]);
    const res = await POST(request({ ...validBody, events: [] }));
    expect(res.status).toBe(201);
    expect(mocks.batch).toHaveBeenCalledWith([expect.anything()]);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({ title: "" }));
    expect(res.status).toBe(400);
  });

  it("400s when folderId or recordingLinkId is unknown", async () => {
    mocks.insert.mockReturnValue(chain(undefined));
    const error = new Error("FK") as Error & { extendedCode: string };
    error.extendedCode = "SQLITE_CONSTRAINT_FOREIGNKEY";
    mocks.batch.mockRejectedValue(error);
    const res = await POST(request({ ...validBody, folderId: "missing" }));
    expect(res.status).toBe(400);
  });

  it("409s when mediaKey is already used", async () => {
    mocks.insert.mockReturnValue(chain(undefined));
    const error = new Error("UNIQUE") as Error & { extendedCode: string };
    error.extendedCode = "SQLITE_CONSTRAINT_UNIQUE";
    mocks.batch.mockRejectedValue(error);
    const res = await POST(request(validBody));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "mediaKey already used" });
  });

  it("rethrows an unrelated error", async () => {
    mocks.insert.mockReturnValue(chain(undefined));
    mocks.batch.mockRejectedValue(new Error("boom"));
    await expect(POST(request(validBody))).rejects.toThrow("boom");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// A minimal fluent builder mock: every method returns itself except the
// terminal one, which resolves to the given value.
function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = {
  user: { id: "u1" },
  workspace: { id: "w1" },
  membership: { role: "Admin" },
};

const mocks = vi.hoisted(() => ({
  listRewinds: vi.fn(),
  insert: vi.fn(),
  batch: vi.fn(),
  findFirstFolder: vi.fn(),
  findFirstRecordingLink: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/lib/rewinds", () => ({ listRewinds: mocks.listRewinds }));
vi.mock("@/lib/auth", () => ({ requireSession: mocks.requireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    batch: mocks.batch,
    query: {
      folders: { findFirst: mocks.findFirstFolder },
      recordingLinks: { findFirst: mocks.findFirstRecordingLink },
    },
  },
}));

import { GET, POST } from "./route";

const row = {
  id: "r1",
  workspaceId: "w1",
  title: "Bug",
  url: "https://x",
  reporterName: "A",
  status: "new",
  kind: "screenshot",
  mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.png",
  durationSeconds: null,
  folderId: null,
  recordingLinkId: null,
  errorSignature: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const request = (body: unknown) =>
  new Request("http://localhost/api/rewinds", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("GET /api/rewinds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mocks.requireSession.mockResolvedValue(unauthorized);
    const res = await GET(new Request("http://localhost/api/rewinds"));
    expect(res.status).toBe(401);
  });

  it("lists the session's workspace rewinds newest first with errorCount", async () => {
    mocks.listRewinds.mockResolvedValue([{ ...row, errorCount: 2 }]);
    const res = await GET(new Request("http://localhost/api/rewinds"));
    expect(res.status).toBe(200);
    expect(mocks.listRewinds).toHaveBeenCalledWith("w1");
    expect(await res.json()).toEqual([
      {
        ...row,
        errorCount: 2,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    ]);
  });
});

describe("POST /api/rewinds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.findFirstFolder.mockResolvedValue({ id: "f1" });
    mocks.findFirstRecordingLink.mockResolvedValue({ id: "l1" });
  });

  const validBody = {
    title: "Bug",
    url: "https://x",
    reporterName: "A",
    kind: "screenshot",
    mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.png",
    events: [{ t: 1, kind: "click", text: "clicked", isError: false }],
  };

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

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

  it("computes and stores the errorSignature from the events on create", async () => {
    const insertChain = chain(undefined);
    mocks.insert.mockReturnValue(insertChain);
    mocks.batch.mockResolvedValue([[row]]);
    await POST(
      request({
        ...validBody,
        events: [
          { t: 0, kind: "err", text: "Uncaught Error: boom 42", isError: true },
        ],
      }),
    );
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ errorSignature: "error: boom n" }),
    );
  });

  it("stores a null errorSignature when there is no error event", async () => {
    const insertChain = chain(undefined);
    mocks.insert.mockReturnValue(insertChain);
    mocks.batch.mockResolvedValue([[row]]);
    await POST(request(validBody));
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ errorSignature: null }),
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

  it("400s when folderId belongs to another workspace (or doesn't exist)", async () => {
    mocks.findFirstFolder.mockResolvedValue(undefined);
    const res = await POST(request({ ...validBody, folderId: "other-ws" }));
    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("400s when recordingLinkId belongs to another workspace (or doesn't exist)", async () => {
    mocks.findFirstRecordingLink.mockResolvedValue(undefined);
    const res = await POST(
      request({ ...validBody, recordingLinkId: "other-ws" }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on a foreign-key violation from the insert itself", async () => {
    mocks.insert.mockReturnValue(chain(undefined));
    const error = new Error("FK") as Error & { extendedCode: string };
    error.extendedCode = "SQLITE_CONSTRAINT_FOREIGNKEY";
    mocks.batch.mockRejectedValue(error);
    const res = await POST(request(validBody));
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

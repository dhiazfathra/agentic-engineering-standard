import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  obj.values = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  listFolders: vi.fn(),
  insert: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/rewinds", () => ({ listFolders: mocks.listFolders }));
vi.mock("@/lib/auth", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
  },
}));

import { GET, POST } from "./route";

const row = { id: "f1", workspaceId: "w1", name: "Bugs", createdAt: new Date() };
const request = (body: unknown) =>
  new Request("http://localhost/api/folders", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("GET /api/folders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await GET(new Request("http://localhost/api/folders"));
    expect(res.status).toBe(401);
  });

  it("lists the session's workspace folders", async () => {
    mocks.listFolders.mockResolvedValue([row]);
    const res = await GET(new Request("http://localhost/api/folders"));
    expect(res.status).toBe(200);
    expect(mocks.listFolders).toHaveBeenCalledWith("w1");
    expect(await res.json()).toEqual([
      { ...row, createdAt: row.createdAt.toISOString() },
    ]);
  });
});

describe("POST /api/folders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(request({ name: "Bugs" }));
    expect(res.status).toBe(401);
  });

  it("creates a folder scoped to the session's workspace", async () => {
    mocks.insert.mockReturnValue(chain([row]));
    const res = await POST(request({ name: "Bugs" }));
    expect(res.status).toBe(201);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({ name: "" }));
    expect(res.status).toBe(400);
  });
});

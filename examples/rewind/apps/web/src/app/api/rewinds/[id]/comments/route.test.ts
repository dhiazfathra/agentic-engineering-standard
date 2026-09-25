import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  obj.values = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  findFirstRewind: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    query: { rewinds: { findFirst: mocks.findFirstRewind } },
  },
}));
vi.mock("@/lib/auth", () => ({ requireSession: mocks.requireSession }));

import { POST } from "./route";

const params = Promise.resolve({ id: "r1" });
const row = {
  id: "c1",
  rewindId: "r1",
  t: 1,
  x: 10,
  y: 10,
  author: "A",
  text: "hi",
};
const validBody = { t: 1, x: 10, y: 10, author: "A", text: "hi" };
const request = (body: unknown) =>
  new Request("http://localhost/api/rewinds/r1/comments", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/rewinds/[id]/comments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.findFirstRewind.mockResolvedValue({ id: "r1", workspaceId: "w1" });
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(request(validBody), { params });
    expect(res.status).toBe(401);
  });

  it("creates a comment", async () => {
    mocks.insert.mockReturnValue(chain([row]));
    const res = await POST(request(validBody), { params });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(row);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({ text: "" }), { params });
    expect(res.status).toBe(400);
  });

  it("404s when the rewind does not exist or belongs to another workspace", async () => {
    mocks.findFirstRewind.mockResolvedValue(undefined);
    const res = await POST(request(validBody), { params });
    expect(res.status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("404s on a foreign-key violation from the insert itself", async () => {
    const error = new Error("FK") as Error & { extendedCode: string };
    error.extendedCode = "SQLITE_CONSTRAINT_FOREIGNKEY";
    const obj: Record<string, unknown> = {};
    obj.values = vi.fn(() => obj);
    obj.returning = vi.fn(() => Promise.reject(error));
    mocks.insert.mockReturnValue(obj);
    const res = await POST(request(validBody), { params });
    expect(res.status).toBe(404);
  });

  it("rethrows an unrelated error", async () => {
    const obj: Record<string, unknown> = {};
    obj.values = vi.fn(() => obj);
    obj.returning = vi.fn(() => Promise.reject(new Error("boom")));
    mocks.insert.mockReturnValue(obj);
    await expect(POST(request(validBody), { params })).rejects.toThrow("boom");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  findMany: vi.fn(),
  requireSession: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
  generateInviteCode: vi.fn(() => "CODE12345AB"),
}));
vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    query: { memberships: { findMany: mocks.findMany } },
  },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireSession: mocks.requireSession,
    createSession: mocks.createSession,
    setSessionCookie: mocks.setSessionCookie,
    generateInviteCode: mocks.generateInviteCode,
  };
});

import { GET, POST } from "./route";

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/workspaces", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("GET /api/workspaces", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("lists the user's workspaces", async () => {
    mocks.findMany.mockResolvedValue([
      { workspace: { id: "w1", name: "Acme" } },
      { workspace: { id: "w2", name: "Beta" } },
    ]);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "w1", name: "Acme" },
      { id: "w2", name: "Beta" },
    ]);
  });
});

describe("POST /api/workspaces", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.createSession.mockResolvedValue("token123");
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(postRequest({ name: "New Co" }));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(postRequest({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("creates a workspace, makes the creator Admin, and switches to it", async () => {
    const workspace = { id: "w2", name: "New Co" };
    mocks.insert.mockReturnValueOnce(chain([workspace])).mockReturnValueOnce(chain([]));
    const res = await POST(postRequest({ name: "New Co" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(workspace);
    expect(mocks.createSession).toHaveBeenCalledWith("u1", "w2");
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(res, "token123");
  });
});

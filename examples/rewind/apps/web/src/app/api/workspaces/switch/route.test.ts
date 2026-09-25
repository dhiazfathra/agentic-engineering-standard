import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  findFirstMembership: vi.fn(),
  findFirstWorkspace: vi.fn(),
  requireSession: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      memberships: { findFirst: mocks.findFirstMembership },
      workspaces: { findFirst: mocks.findFirstWorkspace },
    },
  },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireSession: mocks.requireSession,
    createSession: mocks.createSession,
    setSessionCookie: mocks.setSessionCookie,
  };
});

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("http://localhost/api/workspaces/switch", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/workspaces/switch", () => {
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
    const res = await POST(request({ id: "w2" }));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({ id: "" }));
    expect(res.status).toBe(400);
  });

  it("404s when the user is not a member of that workspace", async () => {
    mocks.findFirstMembership.mockResolvedValue(undefined);
    const res = await POST(request({ id: "w2" }));
    expect(res.status).toBe(404);
  });

  it("switches to a workspace the user belongs to", async () => {
    mocks.findFirstMembership.mockResolvedValue({ workspaceId: "w2", userId: "u1" });
    mocks.findFirstWorkspace.mockResolvedValue({ id: "w2", name: "Beta" });
    const res = await POST(request({ id: "w2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "w2", name: "Beta" });
    expect(mocks.createSession).toHaveBeenCalledWith("u1", "w2");
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(res, "token123");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };
const workspace = { id: "w2", name: "Beta", inviteCode: "CODE1", inviteLinkEnabled: true };

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  findFirstWorkspace: vi.fn(),
  findFirstMembership: vi.fn(),
  requireSession: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    query: {
      workspaces: { findFirst: mocks.findFirstWorkspace },
      memberships: { findFirst: mocks.findFirstMembership },
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
  new Request("http://localhost/api/workspaces/join", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/workspaces/join", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.createSession.mockResolvedValue("token123");
    mocks.findFirstMembership.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue(chain([]));
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(request({ code: "CODE1" }));
    expect(res.status).toBe(401);
  });

  it("400s on invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/workspaces/join", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s when neither code nor inviteUrl is present", async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("That invite link isn't valid");
  });

  it("400s on an unknown code", async () => {
    mocks.findFirstWorkspace.mockResolvedValue(undefined);
    const res = await POST(request({ code: "NOPE" }));
    expect(res.status).toBe(400);
  });

  it("400s when the invite link is disabled", async () => {
    mocks.findFirstWorkspace.mockResolvedValue({ ...workspace, inviteLinkEnabled: false });
    const res = await POST(request({ code: "CODE1" }));
    expect(res.status).toBe(400);
  });

  it("joins by code, creating a Viewer membership and switching", async () => {
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    const res = await POST(request({ code: "CODE1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(workspace);
    expect(mocks.insert).toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledWith("u1", "w2");
  });

  it("extracts the code from an inviteUrl with a trailing slash", async () => {
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    const res = await POST(request({ inviteUrl: "https://app.example/join/CODE1/" }));
    expect(res.status).toBe(200);
    expect(mocks.findFirstWorkspace).toHaveBeenCalled();
  });

  it("extracts the code from an inviteUrl", async () => {
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    const res = await POST(request({ inviteUrl: "https://app.example/join/CODE1" }));
    expect(res.status).toBe(200);
    expect(mocks.findFirstWorkspace).toHaveBeenCalled();
  });

  it("does not duplicate membership when already a member", async () => {
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    mocks.findFirstMembership.mockResolvedValue({ workspaceId: "w2", userId: "u1" });
    const res = await POST(request({ code: "CODE1" }));
    expect(res.status).toBe(200);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

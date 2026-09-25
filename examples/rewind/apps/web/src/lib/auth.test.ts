import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  findFirstSession: vi.fn(),
  findFirstUser: vi.fn(),
  findFirstWorkspace: vi.fn(),
  findFirstMembership: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    query: {
      sessions: { findFirst: mocks.findFirstSession },
      users: { findFirst: mocks.findFirstUser },
      workspaces: { findFirst: mocks.findFirstWorkspace },
      memberships: { findFirst: mocks.findFirstMembership },
    },
  },
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import {
  clearSessionCookie,
  createSession,
  forbidden,
  generateInviteCode,
  generateToken,
  getPageSession,
  getSession,
  hashPassword,
  hashToken,
  notFound,
  publicUser,
  requireAdmin,
  requireSession,
  SESSION_COOKIE,
  setSessionCookie,
  unauthorized,
  verifyPassword,
} from "./auth";

const user = {
  id: "u1",
  email: "a@example.com",
  passwordHash: "secret",
  firstName: "A",
  lastName: "B",
};
const workspace = { id: "w1", name: "W" };
const membership = { workspaceId: "w1", userId: "u1", role: "Admin" };

describe("password hashing", () => {
  it("verifies a password hashed by hashPassword", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("hunter2", stored)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("rejects a malformed stored value", () => {
    expect(verifyPassword("hunter2", "not-a-valid-hash")).toBe(false);
  });
});

describe("tokens", () => {
  it("hashToken is deterministic", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("generateToken returns 64 hex chars", () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateInviteCode returns 11 chars from its alphabet", () => {
    expect(generateInviteCode()).toMatch(/^[A-Za-z0-9]{11}$/);
  });
});

describe("createSession / cookies", () => {
  beforeEach(() => vi.resetAllMocks());

  it("inserts a session row and returns a plaintext token", async () => {
    const chain = { values: vi.fn(() => Promise.resolve()) };
    mocks.insert.mockReturnValue(chain);
    const token = await createSession("u1", "w1");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", workspaceId: "w1" }),
    );
  });

  it("setSessionCookie sets an httpOnly cookie", async () => {
    const set = vi.fn();
    const { NextResponse } = await import("next/server");
    const res = NextResponse.json({});
    res.cookies.set = set;
    setSessionCookie(res, "tok");
    expect(set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      "tok",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("clearSessionCookie expires the cookie", async () => {
    const set = vi.fn();
    const { NextResponse } = await import("next/server");
    const res = NextResponse.json({});
    res.cookies.set = set;
    clearSessionCookie(res);
    expect(set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });
});

function requestWithCookie(cookie?: string) {
  return new Request("http://localhost", {
    headers: cookie ? { cookie } : {},
  });
}

describe("getSession", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null when there is no cookie header", async () => {
    expect(await getSession(requestWithCookie())).toBeNull();
  });

  it("returns null when the session cookie is absent among other cookies", async () => {
    expect(await getSession(requestWithCookie("other=1"))).toBeNull();
  });

  it("returns null when the token matches no session row", async () => {
    mocks.findFirstSession.mockResolvedValue(undefined);
    expect(
      await getSession(requestWithCookie(`${SESSION_COOKIE}=tok`)),
    ).toBeNull();
  });

  it("returns null when the session has expired", async () => {
    mocks.findFirstSession.mockResolvedValue({
      userId: "u1",
      workspaceId: "w1",
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      await getSession(requestWithCookie(`${SESSION_COOKIE}=tok`)),
    ).toBeNull();
  });

  it("returns null when the user, workspace, or membership row is gone", async () => {
    mocks.findFirstSession.mockResolvedValue({
      userId: "u1",
      workspaceId: "w1",
      expiresAt: new Date(Date.now() + 1000),
    });
    mocks.findFirstUser.mockResolvedValue(undefined);
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    mocks.findFirstMembership.mockResolvedValue(membership);
    expect(
      await getSession(requestWithCookie(`${SESSION_COOKIE}=tok; a=b`)),
    ).toBeNull();
  });

  it("returns the full session for a valid token", async () => {
    mocks.findFirstSession.mockResolvedValue({
      userId: "u1",
      workspaceId: "w1",
      expiresAt: new Date(Date.now() + 1000),
    });
    mocks.findFirstUser.mockResolvedValue(user);
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    mocks.findFirstMembership.mockResolvedValue(membership);
    expect(
      await getSession(requestWithCookie(`a=b; ${SESSION_COOKIE}=tok`)),
    ).toEqual({ user, workspace, membership });
  });

  it("ignores a cookie pair with no '='", async () => {
    expect(await getSession(requestWithCookie("garbage"))).toBeNull();
  });
});

describe("getPageSession", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the session cookie via next/headers", async () => {
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: "tok" }),
    });
    mocks.findFirstSession.mockResolvedValue({
      userId: "u1",
      workspaceId: "w1",
      expiresAt: new Date(Date.now() + 1000),
    });
    mocks.findFirstUser.mockResolvedValue(user);
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    mocks.findFirstMembership.mockResolvedValue(membership);
    expect(await getPageSession()).toEqual({ user, workspace, membership });
  });

  it("returns null when there is no session cookie", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    expect(await getPageSession()).toBeNull();
  });
});

describe("response helpers", () => {
  it("unauthorized/forbidden/notFound return the right status", async () => {
    expect(unauthorized().status).toBe(401);
    expect(forbidden().status).toBe(403);
    expect(notFound().status).toBe(404);
  });
});

describe("requireSession / requireAdmin", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requireSession returns 401 when there is no session", async () => {
    const result = await requireSession(requestWithCookie());
    expect(result).not.toBeNull();
    expect((result as Response).status).toBe(401);
  });

  it("requireSession returns the session when valid", async () => {
    mocks.findFirstSession.mockResolvedValue({
      userId: "u1",
      workspaceId: "w1",
      expiresAt: new Date(Date.now() + 1000),
    });
    mocks.findFirstUser.mockResolvedValue(user);
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    mocks.findFirstMembership.mockResolvedValue(membership);
    const result = await requireSession(
      requestWithCookie(`${SESSION_COOKIE}=tok`),
    );
    expect(result).toEqual({ user, workspace, membership });
  });

  it("requireAdmin allows an Admin", () => {
    expect(requireAdmin({ membership } as never)).toBeNull();
  });

  it("requireAdmin forbids a non-Admin", () => {
    const viewer = { ...membership, role: "Viewer" };
    const res = requireAdmin({ membership: viewer } as never);
    expect(res?.status).toBe(403);
  });
});

describe("publicUser", () => {
  it("strips passwordHash", () => {
    expect(publicUser(user)).toEqual({
      id: "u1",
      email: "a@example.com",
      firstName: "A",
      lastName: "B",
    });
  });
});

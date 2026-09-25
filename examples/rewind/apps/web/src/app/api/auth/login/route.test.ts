import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirstUser: vi.fn(),
  findFirstMembership: vi.fn(),
  findFirstWorkspace: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
  setEmailCookie: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mocks.findFirstUser },
      memberships: { findFirst: mocks.findFirstMembership },
      workspaces: { findFirst: mocks.findFirstWorkspace },
    },
  },
}));

vi.mock("@/lib/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    createSession: mocks.createSession,
    setSessionCookie: mocks.setSessionCookie,
    setEmailCookie: mocks.setEmailCookie,
    verifyPassword: mocks.verifyPassword,
  };
});

import { POST } from "./route";

const user = { id: "u1", email: "a@example.com", passwordHash: "x" };
const membership = { workspaceId: "w1", userId: "u1", role: "Admin" };
const workspace = { id: "w1", name: "W" };
const validBody = { email: "a@example.com", password: "hunter2" };
const request = (body: unknown) =>
  new Request("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createSession.mockResolvedValue("tok");
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });

  it("401s when no user matches the email", async () => {
    mocks.findFirstUser.mockResolvedValue(undefined);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("401s when the password is wrong", async () => {
    mocks.findFirstUser.mockResolvedValue(user);
    mocks.verifyPassword.mockReturnValue(false);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("401s when the user has no membership", async () => {
    mocks.findFirstUser.mockResolvedValue(user);
    mocks.verifyPassword.mockReturnValue(true);
    mocks.findFirstMembership.mockResolvedValue(undefined);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("401s when the membership's workspace is gone", async () => {
    mocks.findFirstUser.mockResolvedValue(user);
    mocks.verifyPassword.mockReturnValue(true);
    mocks.findFirstMembership.mockResolvedValue(membership);
    mocks.findFirstWorkspace.mockResolvedValue(undefined);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("logs in and sets the session cookie", async () => {
    mocks.findFirstUser.mockResolvedValue(user);
    mocks.verifyPassword.mockReturnValue(true);
    mocks.findFirstMembership.mockResolvedValue(membership);
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspace).toEqual(workspace);
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(
      expect.anything(),
      "tok",
    );
    expect(mocks.setEmailCookie).toHaveBeenCalledWith(
      expect.anything(),
      validBody.email,
    );
  });
});

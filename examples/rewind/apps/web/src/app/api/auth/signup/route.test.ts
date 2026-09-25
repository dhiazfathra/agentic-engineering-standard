import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  delete: vi.fn(),
  batch: vi.fn(),
  findFirstInvite: vi.fn(),
  findFirstWorkspace: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    delete: mocks.delete,
    batch: mocks.batch,
    query: {
      invites: { findFirst: mocks.findFirstInvite },
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
  };
});

import { POST } from "./route";

const user = {
  id: "u1",
  email: "a@example.com",
  passwordHash: "x",
  firstName: "A",
  lastName: "B",
};
const workspace = { id: "w1", name: "A's Workspace" };
const validBody = {
  email: "a@example.com",
  password: "hunter22",
  firstName: "A",
  lastName: "B",
};
const request = (body: unknown) =>
  new Request("http://localhost/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createSession.mockResolvedValue("tok");
    mocks.findFirstInvite.mockResolvedValue(undefined);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("creates a user and a new workspace when there is no invite", async () => {
    mocks.insert
      .mockReturnValueOnce(chain([user]))
      .mockReturnValueOnce(chain([workspace]))
      .mockReturnValueOnce(chain(undefined));
    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.workspace).toEqual(workspace);
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(
      expect.anything(),
      "tok",
    );
  });

  it("joins the invite's workspace and deletes the invite", async () => {
    mocks.insert
      .mockReturnValueOnce(chain([user]))
      .mockReturnValue(chain(undefined));
    mocks.findFirstInvite.mockResolvedValue({
      workspaceId: "w1",
      email: "a@example.com",
      role: "Viewer",
    });
    mocks.findFirstWorkspace.mockResolvedValue(workspace);
    mocks.delete.mockReturnValue(chain(undefined));
    mocks.batch.mockResolvedValue(undefined);
    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    expect(mocks.batch).toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(2);
  });

  it("409s when the email is already in use", async () => {
    const error = new Error("UNIQUE") as Error & { extendedCode: string };
    error.extendedCode = "SQLITE_CONSTRAINT_UNIQUE";
    const obj: Record<string, unknown> = {};
    obj.values = vi.fn(() => obj);
    obj.returning = vi.fn(() => Promise.reject(error));
    mocks.insert.mockReturnValue(obj);
    const res = await POST(request(validBody));
    expect(res.status).toBe(409);
  });

  it("rethrows an unrelated error", async () => {
    const obj: Record<string, unknown> = {};
    obj.values = vi.fn(() => obj);
    obj.returning = vi.fn(() => Promise.reject(new Error("boom")));
    mocks.insert.mockReturnValue(obj);
    await expect(POST(request(validBody))).rejects.toThrow("boom");
  });
});

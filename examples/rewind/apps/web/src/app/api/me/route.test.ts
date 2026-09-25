import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

function deleteChain() {
  const obj: Record<string, unknown> = {};
  obj.where = vi.fn(() => Promise.resolve(undefined));
  return obj;
}

const user = { id: "u1", email: "a@b.co", passwordHash: "secret", firstName: "A" };
const session = { user, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  delete: vi.fn(),
  findFirst: vi.fn(),
  requireSession: vi.fn(),
  clearSessionCookie: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    update: mocks.update,
    delete: mocks.delete,
    query: { memberships: { findFirst: mocks.findFirst } },
  },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireSession: mocks.requireSession,
    clearSessionCookie: mocks.clearSessionCookie,
  };
});

import { DELETE, GET, PATCH } from "./route";

const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

describe("GET /api/me", () => {
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

  it("returns the user without passwordHash", async () => {
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "u1", email: "a@b.co", firstName: "A" });
  });
});

describe("PATCH /api/me", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await PATCH(patchRequest({ firstName: "New" }));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid body", async () => {
    const res = await PATCH(patchRequest({}));
    expect(res.status).toBe(400);
  });

  it("updates the user and strips passwordHash", async () => {
    mocks.update.mockReturnValue(chain([{ ...user, firstName: "New" }]));
    const res = await PATCH(patchRequest({ firstName: "New" }));
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("passwordHash");
  });
});

describe("DELETE /api/me", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.delete.mockReturnValue(deleteChain());
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await DELETE(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("deletes the user, keeps the workspace when others remain, and clears the cookie", async () => {
    mocks.findFirst.mockResolvedValue({ workspaceId: "w1", userId: "u2" });
    const res = await DELETE(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "u1" });
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.clearSessionCookie).toHaveBeenCalled();
  });

  it("deletes the workspace too when it has no members left", async () => {
    mocks.findFirst.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledTimes(2);
  });
});

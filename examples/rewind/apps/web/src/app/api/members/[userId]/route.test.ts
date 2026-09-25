import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const adminSession = {
  user: { id: "u1" },
  workspace: { id: "w1" },
  membership: { role: "Admin" },
};
const viewerSession = {
  user: { id: "u1" },
  workspace: { id: "w1" },
  membership: { role: "Viewer" },
};

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  delete: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    update: mocks.update,
    delete: mocks.delete,
    query: { memberships: { findFirst: mocks.findFirst, findMany: mocks.findMany } },
  },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});

import { DELETE, PATCH } from "./route";

const params = Promise.resolve({ userId: "u2" });
const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/members/u2", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

describe("PATCH /api/members/[userId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(adminSession);
    mocks.findFirst.mockResolvedValue({ role: "Viewer" });
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await PATCH(patchRequest({ role: "Admin" }), { params });
    expect(res.status).toBe(401);
  });

  it("403s for a non-Admin", async () => {
    mocks.requireSession.mockResolvedValue(viewerSession);
    const res = await PATCH(patchRequest({ role: "Admin" }), { params });
    expect(res.status).toBe(403);
  });

  it("400s on an invalid body", async () => {
    const res = await PATCH(patchRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it("updates the member's role", async () => {
    mocks.update.mockReturnValue(chain([{ userId: "u2", role: "Creator" }]));
    const res = await PATCH(patchRequest({ role: "Creator" }), { params });
    expect(res.status).toBe(200);
  });

  it("404s when the membership is not in this workspace", async () => {
    mocks.update.mockReturnValue(chain([]));
    const res = await PATCH(patchRequest({ role: "Creator" }), { params });
    expect(res.status).toBe(404);
  });

  it("409s demoting the last Admin", async () => {
    mocks.findFirst.mockResolvedValue({ role: "Admin" });
    mocks.findMany.mockResolvedValue([]);
    const res = await PATCH(patchRequest({ role: "Viewer" }), { params });
    expect(res.status).toBe(409);
  });

  it("allows re-affirming the last Admin as Admin", async () => {
    mocks.findFirst.mockResolvedValue({ role: "Admin" });
    mocks.findMany.mockResolvedValue([]);
    mocks.update.mockReturnValue(chain([{ userId: "u2", role: "Admin" }]));
    const res = await PATCH(patchRequest({ role: "Admin" }), { params });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/members/[userId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(adminSession);
    mocks.findFirst.mockResolvedValue({ role: "Viewer" });
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(401);
  });

  it("403s for a non-Admin", async () => {
    mocks.requireSession.mockResolvedValue(viewerSession);
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(403);
  });

  it("removes the member", async () => {
    mocks.delete.mockReturnValue(chain([{ userId: "u2" }]));
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u2" });
  });

  it("404s when the membership is not in this workspace", async () => {
    mocks.delete.mockReturnValue(chain([]));
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });

  it("409s removing the last Admin", async () => {
    mocks.findFirst.mockResolvedValue({ role: "Admin" });
    mocks.findMany.mockResolvedValue([]);
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(409);
  });
});

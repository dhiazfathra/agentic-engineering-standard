import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  delete: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { update: mocks.update, delete: mocks.delete },
}));
vi.mock("@/lib/auth", () => ({ requireSession: mocks.requireSession }));

import { DELETE, PATCH } from "./route";

const row = { id: "f1", workspaceId: "w1", name: "Bugs", createdAt: new Date() };
const params = Promise.resolve({ id: "f1" });
const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/folders/f1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

describe("PATCH /api/folders/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await PATCH(patchRequest({ name: "New" }), { params });
    expect(res.status).toBe(401);
  });

  it("renames the folder", async () => {
    mocks.update.mockReturnValue(chain([row]));
    const res = await PATCH(patchRequest({ name: "New" }), { params });
    expect(res.status).toBe(200);
  });

  it("404s when missing or cross-workspace", async () => {
    mocks.update.mockReturnValue(chain([]));
    const res = await PATCH(patchRequest({ name: "New" }), { params });
    expect(res.status).toBe(404);
  });

  it("400s on an invalid body", async () => {
    const res = await PATCH(patchRequest({ name: "" }), { params });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/folders/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(401);
  });

  it("deletes the folder", async () => {
    mocks.delete.mockReturnValue(chain([row]));
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "f1" });
  });

  it("404s when missing or cross-workspace", async () => {
    mocks.delete.mockReturnValue(chain([]));
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });
});

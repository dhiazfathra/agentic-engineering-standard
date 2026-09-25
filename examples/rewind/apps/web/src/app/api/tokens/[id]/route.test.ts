import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { delete: mocks.delete } }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});

import { DELETE } from "./route";

const params = Promise.resolve({ id: "t1" });

describe("DELETE /api/tokens/[id]", () => {
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

  it("revokes the token", async () => {
    mocks.delete.mockReturnValue(chain([{ id: "t1" }]));
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "t1" });
  });

  it("404s when the token is missing or belongs to another user", async () => {
    mocks.delete.mockReturnValue(chain([]));
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });
});

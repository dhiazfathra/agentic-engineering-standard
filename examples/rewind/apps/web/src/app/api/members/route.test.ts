import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { query: { memberships: { findMany: mocks.findMany } } },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});

import { GET } from "./route";

describe("GET /api/members", () => {
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

  it("lists the workspace's members", async () => {
    mocks.findMany.mockResolvedValue([
      {
        role: "Admin",
        lastActiveAt: new Date(0),
        user: { id: "u1", email: "a@b.co", firstName: "A", lastName: "B" },
      },
    ]);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        userId: "u1",
        email: "a@b.co",
        firstName: "A",
        lastName: "B",
        role: "Admin",
        lastActiveAt: new Date(0).toISOString(),
      },
    ]);
  });
});

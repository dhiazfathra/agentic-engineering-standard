import { beforeEach, describe, expect, it, vi } from "vitest";

function selectChain(value: number) {
  const obj: Record<string, unknown> = {};
  obj.from = vi.fn(() => obj);
  obj.where = vi.fn(() => Promise.resolve([{ value }]));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});

import { GET } from "./route";

describe("GET /api/usage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.select
      .mockReturnValueOnce(selectChain(3))
      .mockReturnValueOnce(selectChain(1))
      .mockReturnValueOnce(selectChain(4));
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("returns counts against the Free plan limits", async () => {
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      rewinds: { used: 3, limit: 30 },
      recordingLinks: { used: 1, limit: 5 },
      members: { used: 4, limit: 20 },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const workspace = { id: "w1", inviteCode: "OLD" };
const adminSession = {
  user: { id: "u1" },
  workspace,
  membership: { role: "Admin" },
};
const viewerSession = {
  user: { id: "u1" },
  workspace,
  membership: { role: "Viewer" },
};

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { update: mocks.update } }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});

import { POST } from "./route";

describe("POST /api/workspace/invite-code/reset", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(adminSession);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("403s for a non-Admin", async () => {
    mocks.requireSession.mockResolvedValue(viewerSession);
    const res = await POST(new Request("http://localhost"));
    expect(res.status).toBe(403);
  });

  it("resets the invite code to a new value", async () => {
    mocks.update.mockReturnValue(chain([{ ...workspace, inviteCode: "NEW" }]));
    const res = await POST(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect((await res.json()).inviteCode).toBe("NEW");
  });
});

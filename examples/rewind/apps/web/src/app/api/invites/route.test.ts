import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const openSession = {
  user: { id: "u1" },
  workspace: { id: "w1", restrictInvites: false },
  membership: { role: "Viewer" },
};
const restrictedViewerSession = {
  user: { id: "u1" },
  workspace: { id: "w1", restrictInvites: true },
  membership: { role: "Viewer" },
};
const restrictedAdminSession = {
  user: { id: "u1" },
  workspace: { id: "w1", restrictInvites: true },
  membership: { role: "Admin" },
};

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { insert: mocks.insert } }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("http://localhost/api/invites", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/invites", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(openSession);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(request({ emails: ["a@b.co"] }));
    expect(res.status).toBe(401);
  });

  it("403s a non-Admin when restrictInvites is on", async () => {
    mocks.requireSession.mockResolvedValue(restrictedViewerSession);
    const res = await POST(request({ emails: ["a@b.co"] }));
    expect(res.status).toBe(403);
  });

  it("400s on an invalid email", async () => {
    const res = await POST(request({ emails: ["not-an-email"] }));
    expect(res.status).toBe(400);
  });

  it("creates invites for any member when restrictInvites is off", async () => {
    mocks.insert.mockReturnValue(chain([{ id: "i1", email: "a@b.co", role: "Viewer" }]));
    const res = await POST(request({ emails: ["a@b.co"] }));
    expect(res.status).toBe(201);
  });

  it("allows an Admin to invite when restrictInvites is on", async () => {
    mocks.requireSession.mockResolvedValue(restrictedAdminSession);
    mocks.insert.mockReturnValue(chain([{ id: "i1", email: "a@b.co", role: "Viewer" }]));
    const res = await POST(request({ emails: ["a@b.co"] }));
    expect(res.status).toBe(201);
  });
});

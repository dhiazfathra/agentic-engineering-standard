import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  del: vi.fn(),
  requireSession: vi.fn(),
  verifyPassword: vi.fn(),
  rateLimit: vi.fn(),
}));
const setWhere = vi.hoisted(() => vi.fn());
const delWhere = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: { update: mocks.update, delete: mocks.del },
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireSession: mocks.requireSession,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { PATCH } from "./route";

const session = { user: { id: "u1", passwordHash: "h" } };
const req = (body: unknown) =>
  new Request("http://localhost/api/me/password", {
    method: "PATCH",
    headers: { cookie: "rw_session=tok" },
    body: JSON.stringify(body),
  });
const good = { currentPassword: "old-pass", newPassword: "new-password" };

describe("PATCH /api/me/password", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.verifyPassword.mockReturnValue(true);
    mocks.update.mockReturnValue({ set: () => ({ where: setWhere }) });
    mocks.del.mockReturnValue({ where: delWhere });
  });

  it("returns the auth failure when signed out", async () => {
    const out = NextResponse.json({}, { status: 401 });
    mocks.requireSession.mockResolvedValue(out);
    expect(await PATCH(req(good))).toBe(out);
  });

  it("returns the 429 when rate limited per user", async () => {
    const limited = new Response(null, { status: 429 });
    mocks.rateLimit.mockResolvedValue(limited);
    expect(await PATCH(req(good))).toBe(limited);
    expect(mocks.rateLimit).toHaveBeenCalledWith([
      { key: "password:user:u1", limit: 5 },
    ]);
  });

  it("400s on an invalid body", async () => {
    expect((await PATCH(req({ currentPassword: "x", newPassword: "short" }))).status).toBe(400);
  });

  it("403s on a wrong current password", async () => {
    mocks.verifyPassword.mockReturnValue(false);
    expect((await PATCH(req(good))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("204s, sets the hash and drops the other sessions", async () => {
    const res = await PATCH(req(good));
    expect(res.status).toBe(204);
    expect(setWhere).toHaveBeenCalledOnce();
    expect(delWhere).toHaveBeenCalledOnce();
  });
});

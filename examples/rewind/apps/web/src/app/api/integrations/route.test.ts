import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  requireSession: vi.fn(),
  flags: { INTEGRATIONS: true },
}));
vi.mock("@/lib/db", () => ({
  db: { query: { integrations: { findMany: mocks.findMany } } },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});
vi.mock("@/lib/flags", () => ({ flags: mocks.flags }));

import { GET } from "./route";

describe("GET /api/integrations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.flags.INTEGRATIONS = true;
    mocks.requireSession.mockResolvedValue(session);
  });

  it("404s when the flag is off", async () => {
    mocks.flags.INTEGRATIONS = false;
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(404);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("lists connected integration names", async () => {
    mocks.findMany.mockResolvedValue([{ name: "Linear" }, { name: "Slack" }]);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(["Linear", "Slack"]);
  });
});

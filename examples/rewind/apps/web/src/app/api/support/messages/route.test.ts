import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  findMany: vi.fn(),
  requireSession: vi.fn(),
  flags: { SUPPORT_WIDGET: true },
}));
vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    query: { supportMessages: { findMany: mocks.findMany } },
  },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});
vi.mock("@/lib/flags", () => ({ flags: mocks.flags }));

import { GET, POST } from "./route";

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/support/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("GET /api/support/messages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.flags.SUPPORT_WIDGET = true;
    mocks.requireSession.mockResolvedValue(session);
  });

  it("404s when the flag is off", async () => {
    mocks.flags.SUPPORT_WIDGET = false;
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

  it("lists the user's messages", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "m1", text: "hi", createdAt: new Date(0) },
    ]);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect((await res.json())[0].text).toBe("hi");
  });
});

describe("POST /api/support/messages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.flags.SUPPORT_WIDGET = true;
    mocks.requireSession.mockResolvedValue(session);
  });

  it("404s when the flag is off", async () => {
    mocks.flags.SUPPORT_WIDGET = false;
    const res = await POST(postRequest({ text: "hi" }));
    expect(res.status).toBe(404);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(postRequest({ text: "hi" }));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(postRequest({ text: "" }));
    expect(res.status).toBe(400);
  });

  it("stores the message and returns a canned reply", async () => {
    mocks.insert.mockReturnValue(
      chain([{ id: "m1", text: "hi", createdAt: new Date(0) }]),
    );
    const res = await POST(postRequest({ text: "hi" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.text).toBe("hi");
    expect(body.reply).toContain("Rewind team");
  });
});

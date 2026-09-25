import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  findMany: vi.fn(),
  requireSession: vi.fn(),
  generateToken: vi.fn(() => "plaintext-token"),
}));
vi.mock("@/lib/db", () => ({
  db: { insert: mocks.insert, query: { accessTokens: { findMany: mocks.findMany } } },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireSession: mocks.requireSession,
    generateToken: mocks.generateToken,
  };
});

import { GET, POST } from "./route";

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/tokens", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("GET /api/tokens", () => {
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

  it("lists tokens without tokenHash", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "t1",
        name: "CI",
        tokenHash: "secret-hash",
        createdAt: new Date(0),
        expiresAt: null,
      },
    ]);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).not.toHaveProperty("tokenHash");
  });
});

describe("POST /api/tokens", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(postRequest({ name: "CI" }));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(postRequest({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("creates a token and returns the plaintext once", async () => {
    mocks.insert.mockReturnValue(
      chain([{ id: "t1", name: "CI", createdAt: new Date(0), tokenHash: "hash" }]),
    );
    const res = await POST(postRequest({ name: "CI" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBe("plaintext-token");
    expect(body).not.toHaveProperty("tokenHash");
  });
});

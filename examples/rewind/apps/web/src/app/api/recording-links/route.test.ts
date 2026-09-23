import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  obj.values = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    query: { recordingLinks: { findMany: mocks.findMany } },
    insert: mocks.insert,
  },
}));

import { GET, POST } from "./route";

const row = { id: "l1", name: "Beta link", createdAt: new Date() };
const request = (body: unknown) =>
  new Request("http://localhost/api/recording-links", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("GET /api/recording-links", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists recording links", async () => {
    mocks.findMany.mockResolvedValue([row]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { ...row, createdAt: row.createdAt.toISOString() },
    ]);
  });
});

describe("POST /api/recording-links", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates a recording link", async () => {
    mocks.insert.mockReturnValue(chain([row]));
    const res = await POST(request({ name: "Beta link" }));
    expect(res.status).toBe(201);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({ name: "" }));
    expect(res.status).toBe(400);
  });
});

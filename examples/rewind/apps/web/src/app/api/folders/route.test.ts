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
    query: { folders: { findMany: mocks.findMany } },
    insert: mocks.insert,
  },
}));

import { GET, POST } from "./route";

const row = { id: "f1", name: "Bugs", createdAt: new Date() };
const request = (body: unknown) =>
  new Request("http://localhost/api/folders", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("GET /api/folders", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists folders", async () => {
    mocks.findMany.mockResolvedValue([row]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { ...row, createdAt: row.createdAt.toISOString() },
    ]);
  });
});

describe("POST /api/folders", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates a folder", async () => {
    mocks.insert.mockReturnValue(chain([row]));
    const res = await POST(request({ name: "Bugs" }));
    expect(res.status).toBe(201);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({ name: "" }));
    expect(res.status).toBe(400);
  });
});

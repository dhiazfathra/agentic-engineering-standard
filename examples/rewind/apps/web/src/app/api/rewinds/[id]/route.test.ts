import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  s3Send: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { rewinds: { findFirst: mocks.findFirst } },
    update: mocks.update,
    delete: mocks.delete,
  },
}));
vi.mock("@/lib/storage", () => ({ s3: { send: mocks.s3Send } }));

import { DELETE, GET, PATCH } from "./route";

const row = {
  id: "r1",
  title: "Bug",
  mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.png",
  status: "new",
  events: [],
  comments: [],
};

const params = Promise.resolve({ id: "r1" });
const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/rewinds/r1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

describe("GET /api/rewinds/[id]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the rewind with events and comments", async () => {
    mocks.findFirst.mockResolvedValue(row);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);
  });

  it("404s when missing", async () => {
    mocks.findFirst.mockResolvedValue(undefined);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/rewinds/[id]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("updates and returns the row", async () => {
    mocks.update.mockReturnValue(chain([row]));
    const res = await PATCH(patchRequest({ title: "New" }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);
  });

  it("404s when no row updated", async () => {
    mocks.update.mockReturnValue(chain([]));
    const res = await PATCH(patchRequest({ title: "New" }), { params });
    expect(res.status).toBe(404);
  });

  it("400s on an invalid body", async () => {
    const res = await PATCH(patchRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it("400s when folderId is unknown", async () => {
    const error = new Error("FK") as Error & { extendedCode: string };
    error.extendedCode = "SQLITE_CONSTRAINT_FOREIGNKEY";
    const obj: Record<string, unknown> = {};
    for (const m of ["set", "where"]) obj[m] = vi.fn(() => obj);
    obj.returning = vi.fn(() => Promise.reject(error));
    mocks.update.mockReturnValue(obj);
    const res = await PATCH(patchRequest({ folderId: "missing" }), {
      params,
    });
    expect(res.status).toBe(400);
  });

  it("rethrows an unrelated error", async () => {
    const obj: Record<string, unknown> = {};
    for (const m of ["set", "where"]) obj[m] = vi.fn(() => obj);
    obj.returning = vi.fn(() => Promise.reject(new Error("boom")));
    mocks.update.mockReturnValue(obj);
    await expect(
      PATCH(patchRequest({ title: "New" }), { params }),
    ).rejects.toThrow("boom");
  });
});

describe("DELETE /api/rewinds/[id]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("deletes the row and the blob, returns 200", async () => {
    mocks.delete.mockReturnValue(chain([row]));
    mocks.s3Send.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "r1" });
    expect(mocks.s3Send).toHaveBeenCalled();
  });

  it("404s when missing", async () => {
    mocks.delete.mockReturnValue(chain([]));
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });

  it("still returns 200 when storage is unreachable", async () => {
    mocks.delete.mockReturnValue(chain([row]));
    mocks.s3Send.mockRejectedValue(new Error("ECONNREFUSED"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalled();
  });
});

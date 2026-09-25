import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "set", "where"]) obj[m] = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const session = {
  user: { id: "u1" },
  workspace: { id: "w1" },
  membership: { role: "Admin" },
};

const mocks = vi.hoisted(() => ({
  getRewind: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  s3Send: vi.fn(),
  getSession: vi.fn(),
  findFirstWorkspace: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { workspaces: { findFirst: mocks.findFirstWorkspace } },
    update: mocks.update,
    delete: mocks.delete,
  },
}));
vi.mock("@/lib/rewinds", () => ({ getRewind: mocks.getRewind }));
vi.mock("@/lib/storage", () => ({ s3: { send: mocks.s3Send } }));
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>(
    "@/lib/auth",
  );
  return { ...actual, getSession: mocks.getSession };
});

import { DELETE, GET, PATCH } from "./route";

const row = {
  id: "r1",
  workspaceId: "w1",
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
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue(session);
  });

  it("returns the rewind for a session in its workspace", async () => {
    mocks.getRewind.mockResolvedValue(row);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);
  });

  it("404s when missing", async () => {
    mocks.getRewind.mockResolvedValue(undefined);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });

  it("401s cross-workspace with no session", async () => {
    mocks.getRewind.mockResolvedValue(row);
    mocks.getSession.mockResolvedValue(null);
    mocks.findFirstWorkspace.mockResolvedValue({ defaultLinkAccess: "members" });
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(401);
  });

  it("404s cross-workspace with a session in another workspace", async () => {
    mocks.getRewind.mockResolvedValue(row);
    mocks.getSession.mockResolvedValue({
      ...session,
      workspace: { id: "other" },
    });
    mocks.findFirstWorkspace.mockResolvedValue({ defaultLinkAccess: "members" });
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });

  it("is public with no session when the workspace allows anyone", async () => {
    mocks.getRewind.mockResolvedValue(row);
    mocks.getSession.mockResolvedValue(null);
    mocks.findFirstWorkspace.mockResolvedValue({ defaultLinkAccess: "anyone" });
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/rewinds/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ title: "New" }), { params });
    expect(res.status).toBe(401);
  });

  it("updates and returns the row", async () => {
    mocks.update.mockReturnValue(chain([row]));
    const res = await PATCH(patchRequest({ title: "New" }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);
  });

  it("404s when no row updated (missing or cross-workspace)", async () => {
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
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue(session);
  });

  it("401s without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(401);
  });

  it("deletes the row and the blob, returns 200", async () => {
    mocks.delete.mockReturnValue(chain([row]));
    mocks.s3Send.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "r1" });
    expect(mocks.s3Send).toHaveBeenCalled();
  });

  it("404s when missing or cross-workspace", async () => {
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

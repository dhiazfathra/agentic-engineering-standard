import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  obj.values = vi.fn(() => obj);
  obj.returning = vi.fn(() => Promise.resolve(resolved));
  return obj;
}

const mocks = vi.hoisted(() => ({
  findFirstRecordingLink: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    query: { recordingLinks: { findFirst: mocks.findFirstRecordingLink } },
    insert: mocks.insert,
  },
}));

import { POST } from "./route";

const link = { id: "l1", name: "Beta testers", workspaceId: "w1" };
const row = {
  id: "r1",
  title: "Recording from Beta testers",
  workspaceId: "w1",
  recordingLinkId: "l1",
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: unknown) =>
  new Request("http://localhost/api/rec/l1/rewinds", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/rec/[id]/rewinds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findFirstRecordingLink.mockResolvedValue(link);
  });

  it("404s for an unknown link id", async () => {
    mocks.findFirstRecordingLink.mockResolvedValue(undefined);
    const res = await POST(
      request({
        mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.webm",
        durationSeconds: 4,
      }),
      params("missing"),
    );
    expect(res.status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("400s on an invalid body", async () => {
    const res = await POST(request({ mediaKey: "nope" }), params("l1"));
    expect(res.status).toBe(400);
  });

  it("files the rewind into the link's workspace, titled from the link", async () => {
    mocks.insert.mockReturnValue(chain([row]));
    const res = await POST(
      request({
        mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.webm",
        durationSeconds: 4,
      }),
      params("l1"),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(row);
    const inserted = mocks.insert.mock.results[0]!.value.values.mock
      .calls[0][0];
    expect(inserted).toMatchObject({
      title: "Recording from Beta testers",
      workspaceId: "w1",
      recordingLinkId: "l1",
      kind: "video",
      url: "http://localhost/rec/l1",
    });
  });

  it("409s when mediaKey is already used", async () => {
    const chained = chain(undefined);
    chained.returning = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error("dup"), {
          extendedCode: "SQLITE_CONSTRAINT_UNIQUE",
        }),
      ),
    );
    mocks.insert.mockReturnValue(chained);
    const res = await POST(
      request({
        mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.webm",
        durationSeconds: 4,
      }),
      params("l1"),
    );
    expect(res.status).toBe(409);
  });

  it("rethrows an unrelated database error", async () => {
    const chained = chain(undefined);
    chained.returning = vi.fn(() => Promise.reject(new Error("db down")));
    mocks.insert.mockReturnValue(chained);
    await expect(
      POST(
        request({
          mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.webm",
          durationSeconds: 4,
        }),
        params("l1"),
      ),
    ).rejects.toThrow("db down");
  });
});

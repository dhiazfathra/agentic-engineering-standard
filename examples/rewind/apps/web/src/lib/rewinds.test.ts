import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findManyRewinds: vi.fn(),
  findManyFolders: vi.fn(),
  orderBy: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      rewinds: { findFirst: mocks.findFirst, findMany: mocks.findManyRewinds },
      folders: { findMany: mocks.findManyFolders },
    },
    select: () => ({
      from: () => ({ where: () => ({ orderBy: mocks.orderBy }) }),
    }),
  },
}));

const { getRewind, listRewinds, listFolders, listSimilarRewinds } =
  await import("./rewinds");

it("finds a rewind with its events and comments ordered by t", async () => {
  const row = { id: "r1", events: [], comments: [] };
  mocks.findFirst.mockResolvedValue(row);
  await expect(getRewind("r1")).resolves.toBe(row);
  expect(mocks.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      with: expect.objectContaining({
        events: expect.any(Object),
        comments: expect.any(Object),
      }),
    }),
  );
});

it("resolves undefined when missing", async () => {
  mocks.findFirst.mockResolvedValue(undefined);
  await expect(getRewind("missing")).resolves.toBeUndefined();
});

it("lists rewinds newest first, including one with 0 errors", async () => {
  const rows = [
    { id: "r1", errorCount: 3 },
    { id: "r2", errorCount: 0 },
  ];
  mocks.orderBy.mockResolvedValue(rows);
  await expect(listRewinds("w1")).resolves.toBe(rows);
});

it("lists every folder in the workspace", async () => {
  const rows = [{ id: "f1", name: "Bugs" }];
  mocks.findManyFolders.mockResolvedValue(rows);
  await expect(listFolders("w1")).resolves.toBe(rows);
});

it("lists other rewinds sharing the same errorSignature, newest first", async () => {
  const rows = [{ id: "r2", title: "Other", reporterName: "Leo", createdAt: new Date() }];
  mocks.findManyRewinds.mockResolvedValue(rows);
  await expect(
    listSimilarRewinds("w1", "sig-1", "r1"),
  ).resolves.toBe(rows);
  expect(mocks.findManyRewinds).toHaveBeenCalledWith(
    expect.objectContaining({
      columns: { id: true, title: true, reporterName: true, createdAt: true },
    }),
  );
});

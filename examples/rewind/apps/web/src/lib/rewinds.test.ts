import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findManyFolders: vi.fn(),
  orderBy: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      rewinds: { findFirst: mocks.findFirst },
      folders: { findMany: mocks.findManyFolders },
    },
    select: () => ({
      from: () => ({ orderBy: mocks.orderBy }),
    }),
  },
}));

const { getRewind, listRewinds, listFolders } = await import("./rewinds");

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
  await expect(listRewinds()).resolves.toBe(rows);
});

it("lists every folder", async () => {
  const rows = [{ id: "f1", name: "Bugs" }];
  mocks.findManyFolders.mockResolvedValue(rows);
  await expect(listFolders()).resolves.toBe(rows);
});

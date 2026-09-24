import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { query: { rewinds: { findFirst: mocks.findFirst } } },
}));

const { getRewind } = await import("./rewinds");

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

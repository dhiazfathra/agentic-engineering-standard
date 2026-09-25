import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { query: { recordingLinks: { findFirst: mocks.findFirst } } },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.findFirst.mockReset();
});

it("renders the recorder for a known link", async () => {
  const { default: RecPage } = await import("./page");
  mocks.findFirst.mockResolvedValue({ id: "l1", name: "Beta testers" });
  const html = renderToStaticMarkup(await RecPage(params("l1")));
  expect(html).toContain("Ready to record?");
});

it("404s for an unknown link id", async () => {
  const { default: RecPage } = await import("./page");
  mocks.findFirst.mockResolvedValue(undefined);
  await expect(RecPage(params("missing"))).rejects.toThrow("NOT_FOUND");
});

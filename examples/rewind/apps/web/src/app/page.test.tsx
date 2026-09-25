import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRewinds: vi.fn(),
  listFolders: vi.fn(),
}));

vi.mock("@/lib/rewinds", () => ({
  listRewinds: mocks.listRewinds,
  listFolders: mocks.listFolders,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {} }),
}));

const rewind = {
  id: "seed-r1",
  title: "Checkout fails after applying coupon",
  url: "https://shop.acme.co/cart",
  reporterName: "Maya Chen",
  status: "new",
  kind: "video",
  mediaKey: "rewinds/seed-r1.webm",
  durationSeconds: 42,
  folderId: null,
  recordingLinkId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  errorCount: 0,
};

const folder = { id: "f1", name: "Checkout bugs" };

beforeEach(() => {
  mocks.listRewinds.mockReset();
  mocks.listFolders.mockReset();
});

it("loads and renders the seeded Rewinds", async () => {
  const { default: Home } = await import("./page");
  mocks.listRewinds.mockResolvedValue([rewind]);
  mocks.listFolders.mockResolvedValue([folder]);
  const html = renderToStaticMarkup(
    await Home({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain(rewind.title);
  expect(html).toContain(folder.name);
});

it("parses the view and folder search params", async () => {
  const { default: Home } = await import("./page");
  mocks.listRewinds.mockResolvedValue([rewind]);
  mocks.listFolders.mockResolvedValue([folder]);
  const html = renderToStaticMarkup(
    await Home({
      searchParams: Promise.resolve({ view: "board", folder: "f1" }),
    }),
  );
  expect(html).toContain(folder.name);
});

it("loads with one Promise.all call for rewinds and folders", async () => {
  const { default: Home } = await import("./page");
  mocks.listRewinds.mockResolvedValue([]);
  mocks.listFolders.mockResolvedValue([]);
  await Home({ searchParams: Promise.resolve({}) });
  expect(mocks.listRewinds).toHaveBeenCalledTimes(1);
  expect(mocks.listFolders).toHaveBeenCalledTimes(1);
});

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRewind: vi.fn(),
  mediaUrl: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/rewinds", () => ({ getRewind: mocks.getRewind }));
vi.mock("@/lib/storage", () => ({ mediaUrl: mocks.mediaUrl }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

const { default: RewindPage, generateMetadata } = await import("./page");

const params = Promise.resolve({ id: "seed-r1" });

const row = {
  id: "seed-r1",
  title: "Checkout fails after applying coupon",
  url: "https://shop.acme.co/cart",
  reporterName: "Maya Chen",
  status: "new",
  kind: "video",
  mediaKey: "rewinds/seed-r1.webm",
  durationSeconds: 42,
  createdAt: new Date(),
  events: [],
  comments: [],
};

it("renders the Viewer with the row when found", async () => {
  mocks.getRewind.mockResolvedValue(row);
  mocks.mediaUrl.mockResolvedValue("https://signed.example/media");
  const html = renderToStaticMarkup(await RewindPage({ params }));
  expect(html).toContain(row.title);
});

it("calls notFound when missing", async () => {
  mocks.getRewind.mockResolvedValue(undefined);
  await expect(RewindPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
});

it("sets the metadata title to the Rewind's title", async () => {
  mocks.getRewind.mockResolvedValue(row);
  await expect(generateMetadata({ params })).resolves.toEqual({
    title: row.title,
  });
});

it("falls back the metadata title when the Rewind is missing", async () => {
  mocks.getRewind.mockResolvedValue(undefined);
  await expect(generateMetadata({ params })).resolves.toEqual({
    title: "Rewind",
  });
});

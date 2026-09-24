import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

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

// Vitest resolves "react"'s client build, whose cache() is a passthrough;
// only the react-server build (what Next.js's server component bundler
// actually wires page.tsx to) memoizes per request. Fake a real,
// per-argument memoizer here so this file can verify page.tsx's own use of
// cache() — the memoization itself is React/Next's contract, not this
// project's code. Each test re-imports page.tsx (below) to get a fresh
// cache scope, the same as a fresh request would.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const store = new Map<string, R>();
      return (...args: A): R => {
        const key = JSON.stringify(args);
        if (!store.has(key)) store.set(key, fn(...args));
        return store.get(key)!;
      };
    },
  };
});

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

async function loadPage() {
  vi.resetModules();
  return import("./page");
}

beforeEach(() => {
  mocks.getRewind.mockReset();
  mocks.mediaUrl.mockReset();
});

it("renders the Viewer with the row when found", async () => {
  const { default: RewindPage } = await loadPage();
  mocks.getRewind.mockResolvedValue(row);
  mocks.mediaUrl.mockResolvedValue("https://signed.example/media");
  const html = renderToStaticMarkup(await RewindPage({ params }));
  expect(html).toContain(row.title);
});

it("calls notFound when missing", async () => {
  const { default: RewindPage } = await loadPage();
  mocks.getRewind.mockResolvedValue(undefined);
  await expect(RewindPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
});

it("sets the metadata title to the Rewind's title", async () => {
  const { generateMetadata } = await loadPage();
  mocks.getRewind.mockResolvedValue(row);
  await expect(generateMetadata({ params })).resolves.toEqual({
    title: row.title,
  });
});

it("falls back the metadata title when the Rewind is missing", async () => {
  const { generateMetadata } = await loadPage();
  mocks.getRewind.mockResolvedValue(undefined);
  await expect(generateMetadata({ params })).resolves.toEqual({
    title: "Rewind",
  });
});

it("shares one getRewind call between generateMetadata and the page", async () => {
  const { default: RewindPage, generateMetadata } = await loadPage();
  mocks.getRewind.mockResolvedValue(row);
  mocks.mediaUrl.mockResolvedValue("https://signed.example/media");
  await generateMetadata({ params });
  await RewindPage({ params });
  expect(mocks.getRewind).toHaveBeenCalledTimes(1);
});

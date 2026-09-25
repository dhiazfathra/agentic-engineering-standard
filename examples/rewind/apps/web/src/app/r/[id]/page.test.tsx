import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRewind: vi.fn(),
  mediaUrl: vi.fn(),
  getPageSession: vi.fn(),
  findFirstWorkspace: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/rewinds", () => ({ getRewind: mocks.getRewind }));
vi.mock("@/lib/storage", () => ({ mediaUrl: mocks.mediaUrl }));
vi.mock("@/lib/auth", () => ({ getPageSession: mocks.getPageSession }));
vi.mock("@/lib/db", () => ({
  db: { query: { workspaces: { findFirst: mocks.findFirstWorkspace } } },
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

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
  workspaceId: "w1",
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
  mocks.getPageSession.mockReset();
  mocks.findFirstWorkspace.mockReset();
  mocks.notFound.mockClear();
  mocks.redirect.mockClear();
  mocks.getPageSession.mockResolvedValue({ workspace: { id: "w1" } });
  mocks.findFirstWorkspace.mockResolvedValue({ defaultLinkAccess: "members" });
});

it("renders the Viewer with the row when found", async () => {
  const { default: RewindPage } = await loadPage();
  mocks.getRewind.mockResolvedValue(row);
  mocks.mediaUrl.mockResolvedValue("https://signed.example/media");
  const html = renderToStaticMarkup(await RewindPage({ params }));
  expect(html).toContain(row.title);
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

it("404s when missing; redirects to /login when logged out and cross-workspace; 404s when logged in and cross-workspace", async () => {
  const { default: RewindPage } = await loadPage();

  mocks.getRewind.mockResolvedValue(undefined);
  await expect(
    RewindPage({ params: Promise.resolve({ id: "missing" }) }),
  ).rejects.toThrow("NEXT_NOT_FOUND");

  mocks.getRewind.mockResolvedValue(row);
  mocks.getPageSession.mockResolvedValue(null);
  await expect(
    RewindPage({ params: Promise.resolve({ id: "logged-out" }) }),
  ).rejects.toThrow("NEXT_REDIRECT");

  mocks.getPageSession.mockResolvedValue({ workspace: { id: "other" } });
  await expect(
    RewindPage({ params: Promise.resolve({ id: "cross-workspace" }) }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
});

it("renders for a logged-out viewer when the workspace allows anyone", async () => {
  const { default: RewindPage } = await loadPage();
  mocks.getRewind.mockResolvedValue(row);
  mocks.mediaUrl.mockResolvedValue("https://signed.example/media");
  mocks.getPageSession.mockResolvedValue(null);
  mocks.findFirstWorkspace.mockResolvedValue({ defaultLinkAccess: "anyone" });
  const html = renderToStaticMarkup(await RewindPage({ params }));
  expect(html).toContain(row.title);
});

it("shares one getRewind call between generateMetadata and the page", async () => {
  const { default: RewindPage, generateMetadata } = await loadPage();
  mocks.getRewind.mockResolvedValue(row);
  mocks.mediaUrl.mockResolvedValue("https://signed.example/media");
  await generateMetadata({ params });
  await RewindPage({ params });
  expect(mocks.getRewind).toHaveBeenCalledTimes(1);
});

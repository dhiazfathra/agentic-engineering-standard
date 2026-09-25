import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRecordingLinks: vi.fn(),
  getPageSession: vi.fn(),
}));

vi.mock("@/lib/rewinds", () => ({
  listRecordingLinks: mocks.listRecordingLinks,
}));

vi.mock("@/lib/auth", () => ({
  getPageSession: mocks.getPageSession,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const session = { user: { id: "u1" }, workspace: { id: "w1" } };
const link = {
  id: "l1",
  workspaceId: "w1",
  name: "Beta testers",
  createdAt: new Date(),
  rewindCount: 14,
};

beforeEach(() => {
  mocks.listRecordingLinks.mockReset();
  mocks.getPageSession.mockReset();
  mocks.getPageSession.mockResolvedValue(session);
});

it("loads and renders the workspace's recording links", async () => {
  const { default: Links } = await import("./page");
  mocks.listRecordingLinks.mockResolvedValue([link]);
  const html = renderToStaticMarkup(await Links());
  expect(html).toContain(link.name);
  expect(mocks.listRecordingLinks).toHaveBeenCalledWith("w1");
});

it("redirects to /login when there is no session", async () => {
  const { default: Links } = await import("./page");
  mocks.getPageSession.mockResolvedValue(null);
  await expect(Links()).rejects.toThrow("REDIRECT:/login");
});

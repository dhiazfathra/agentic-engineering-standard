import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPageSession: vi.fn(),
  flags: { HELPDESK: true },
}));

vi.mock("@/lib/auth", () => ({ getPageSession: mocks.getPageSession }));
vi.mock("@/lib/flags", () => ({ flags: mocks.flags }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const session = { user: { id: "u1" }, workspace: { id: "w1" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.flags.HELPDESK = true;
  mocks.getPageSession.mockResolvedValue(session);
});

it("404s when the flag is off", async () => {
  mocks.flags.HELPDESK = false;
  const { default: Helpdesk } = await import("./page");
  await expect(Helpdesk()).rejects.toThrow("NOT_FOUND");
});

it("redirects to /login without a session", async () => {
  mocks.getPageSession.mockResolvedValue(null);
  const { default: Helpdesk } = await import("./page");
  await expect(Helpdesk()).rejects.toThrow("REDIRECT:/login");
});

it("renders the helpdesk page", async () => {
  const { default: Helpdesk } = await import("./page");
  const html = renderToStaticMarkup(await Helpdesk());
  expect(html).toContain("Resolve customer issues");
});

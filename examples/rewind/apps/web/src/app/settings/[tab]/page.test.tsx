import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPageSession: vi.fn(),
  listMembers: vi.fn(),
  getUsage: vi.fn(),
  mediaUrl: vi.fn(),
  listIntegrations: vi.fn(),
  flags: { INTEGRATIONS: false } as Record<string, boolean>,
}));

vi.mock("@/lib/flags", () => ({ flags: mocks.flags }));
vi.mock("@/lib/integrations", () => ({
  listIntegrations: mocks.listIntegrations,
}));

vi.mock("@/lib/auth", () => ({
  getPageSession: mocks.getPageSession,
  publicUser: (u: Record<string, unknown>) => {
    const rest = { ...u };
    delete rest.passwordHash;
    return rest;
  },
}));

vi.mock("@/lib/members", () => ({ listMembers: mocks.listMembers }));
vi.mock("@/lib/usage", () => ({ getUsage: mocks.getUsage }));
vi.mock("@/lib/storage", () => ({ mediaUrl: mocks.mediaUrl }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("./settings", () => ({
  SettingsPage: (props: Record<string, unknown>) => (
    <div data-testid="settings-page">{JSON.stringify(Object.keys(props))}</div>
  ),
}));

const session = {
  user: { id: "u1", passwordHash: "x", avatarKey: null },
  workspace: { id: "w1", logoKey: null },
  membership: { role: "Admin" },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getPageSession.mockResolvedValue(session);
  mocks.listMembers.mockResolvedValue([]);
  mocks.getUsage.mockResolvedValue({
    rewinds: { used: 0, limit: 30 },
    recordingLinks: { used: 0, limit: 5 },
    members: { used: 1, limit: 20 },
  });
  mocks.mediaUrl.mockResolvedValue("https://minio/signed");
  mocks.flags.INTEGRATIONS = false;
  mocks.listIntegrations.mockResolvedValue([]);
});

it("redirects to /login without a session", async () => {
  mocks.getPageSession.mockResolvedValue(null);
  const { default: Settings } = await import("./page");
  await expect(
    Settings({ params: Promise.resolve({ tab: "general" }) }),
  ).rejects.toThrow("REDIRECT:/login");
});

it("404s for a tab not built yet", async () => {
  const { default: Settings } = await import("./page");
  await expect(
    Settings({ params: Promise.resolve({ tab: "bogus" as never }) }),
  ).rejects.toThrow("NOT_FOUND");
});

it("404s for a built tab whose flag is off (integrations)", async () => {
  const { default: Settings } = await import("./page");
  await expect(
    Settings({ params: Promise.resolve({ tab: "integrations" }) }),
  ).rejects.toThrow("NOT_FOUND");
  expect(mocks.listIntegrations).not.toHaveBeenCalled();
});

it("loads connected integrations when the flag is on", async () => {
  mocks.flags.INTEGRATIONS = true;
  mocks.listIntegrations.mockResolvedValue(["Linear"]);
  const { default: Settings } = await import("./page");
  renderToStaticMarkup(
    await Settings({ params: Promise.resolve({ tab: "general" }) }),
  );
  expect(mocks.listIntegrations).toHaveBeenCalledWith("w1");
});

it("404s for a built tab whose flag is off", async () => {
  const { default: Settings } = await import("./page");
  await expect(
    Settings({ params: Promise.resolve({ tab: "billing" }) }),
  ).rejects.toThrow("NOT_FOUND");
});

it("renders a built tab and loads members and usage", async () => {
  const { default: Settings } = await import("./page");
  const html = renderToStaticMarkup(
    await Settings({ params: Promise.resolve({ tab: "general" }) }),
  );
  expect(html).toContain("settings-page");
  expect(mocks.listMembers).toHaveBeenCalledWith("w1");
  expect(mocks.getUsage).toHaveBeenCalledWith("w1");
  expect(mocks.mediaUrl).not.toHaveBeenCalled();
});

it("resolves logo and avatar urls only when the keys are present", async () => {
  mocks.getPageSession.mockResolvedValue({
    ...session,
    user: { ...session.user, avatarKey: "avatars/a.png" },
    workspace: { ...session.workspace, logoKey: "logos/l.png" },
  });
  const { default: Settings } = await import("./page");
  renderToStaticMarkup(
    await Settings({ params: Promise.resolve({ tab: "account" }) }),
  );
  expect(mocks.mediaUrl).toHaveBeenCalledWith("avatars/a.png");
  expect(mocks.mediaUrl).toHaveBeenCalledWith("logos/l.png");
});

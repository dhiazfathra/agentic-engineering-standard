// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DefaultLinkAccess, UserRole } from "@/db/schema";
import type { MemberListItem } from "@/lib/members";
import type { Usage } from "@/lib/usage";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const mockFlags = vi.hoisted(() => ({
  AI_SUMMARY: true,
  SIMILAR_MERGE: true,
  INTEGRATIONS: true,
  BILLING: true,
  SDK: true,
  CLI_MCP: true,
  WEBHOOKS: true,
  HELPDESK: true,
  SUPPORT_WIDGET: true,
  EMAIL: true,
  SSO_AUDIT_AUTODEL: true,
  EXTERNAL_LINKS: true,
}));
vi.mock("@/lib/flags", () => ({ flags: mockFlags }));

const { SettingsPage } = await import("./settings");

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  theme: "light" | "dark";
  avatarKey: string | null;
  notifyN1: boolean;
  notifyN2: boolean;
  notifyN3: boolean;
  notifyN4: boolean;
  notifyN5: boolean;
  createdAt: Date;
};

type Workspace = {
  id: string;
  name: string;
  logoKey: string | null;
  inviteCode: string;
  inviteLinkEnabled: boolean;
  restrictInvites: boolean;
  defaultLinkAccess: DefaultLinkAccess;
  aiEnabled: boolean;
  ssoEnabled: boolean;
  autoDelete: boolean;
  auditLogs: boolean;
  groupDuplicates: boolean;
  createdAt: Date;
};

function user(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "dhiaz@acme.co",
    firstName: "Dhiaz",
    lastName: "Fathra",
    role: "Engineering",
    theme: "light",
    avatarKey: null,
    notifyN1: true,
    notifyN2: true,
    notifyN3: true,
    notifyN4: true,
    notifyN5: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "w1",
    name: "Acme",
    logoKey: null,
    inviteCode: "abc123XYZ01",
    inviteLinkEnabled: true,
    restrictInvites: false,
    defaultLinkAccess: "anyone",
    aiEnabled: false,
    ssoEnabled: false,
    autoDelete: false,
    auditLogs: false,
    groupDuplicates: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function member(overrides: Partial<MemberListItem> = {}): MemberListItem {
  return {
    userId: "u2",
    email: "maya@acme.co",
    firstName: "Maya",
    lastName: "Chen",
    role: "Creator",
    lastActiveAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function usage(overrides: Partial<Usage> = {}): Usage {
  return {
    rewinds: { used: 3, limit: 30 },
    recordingLinks: { used: 1, limit: 5 },
    members: { used: 2, limit: 20 },
    ...overrides,
  };
}

function jsonFetchFor(
  handlers: Record<string, { status?: number; body?: unknown }>,
) {
  return vi.fn((url: string, opts?: RequestInit) => {
    const key = `${opts?.method ?? "GET"} ${url}`;
    const entry = handlers[key] ?? handlers[url];
    const status = entry?.status ?? 200;
    return Promise.resolve(
      new Response(JSON.stringify(entry?.body ?? {}), { status }),
    );
  });
}

let container: HTMLDivElement;
let root: Root;

function mount(el: React.ReactElement) {
  act(() => {
    root.render(el);
  });
}

function q(selector: string): HTMLElement | null {
  return container.querySelector(selector);
}

function qAll(selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll(selector));
}

function byText(selector: string, text: string): HTMLElement {
  const el = qAll(selector).find((e) => e.textContent?.trim() === text);
  if (!el) throw new Error(`no ${selector} with text: ${text}`);
  return el;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function blur(el: HTMLElement) {
  // React's onBlur listens for the (bubbling) native "focusout" event, not
  // "blur", which does not bubble.
  act(() => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    tab: "general" as const,
    user: user(),
    workspace: workspace(),
    role: "Admin" as const,
    members: [member()],
    usage: usage(),
    logoUrl: null,
    avatarUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.assign(mockFlags, {
    AI_SUMMARY: true,
    INTEGRATIONS: true,
    BILLING: true,
    SDK: true,
    CLI_MCP: true,
    WEBHOOKS: true,
    SSO_AUDIT_AUTODEL: true,
  });
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  vi.stubGlobal(
    "location",
    Object.assign(new URL("https://app.rewind.test"), { assign: vi.fn() }),
  );
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("nav", () => {
  it("shows all groups and hides flagged items whose flag is off", async () => {
    Object.assign(mockFlags, { BILLING: false, WEBHOOKS: false });
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    expect(qAll('a[href="/settings/billing"]')).toHaveLength(0);
    expect(qAll('a[href="/settings/webhooks"]')).toHaveLength(0);
    expect(qAll('a[href="/settings/general"]')).toHaveLength(1);
    expect(qAll('a[href="/settings/account"]')).toHaveLength(1);
    expect(container.textContent).toContain("Back to app");
  });

  it("drops a nav group entirely when every item's flag is off", async () => {
    Object.assign(mockFlags, {
      INTEGRATIONS: false,
      SDK: false,
      CLI_MCP: false,
      WEBHOOKS: false,
    });
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    expect(container.textContent).not.toContain("Apps & tools");
  });

  it("marks the active tab", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps({ tab: "members" })} />);
    await flush();
    const active = q('a[href="/settings/members"]')!;
    expect(active.className).toMatch(/navItemActive/);
  });
});

describe("general tab", () => {
  it("saves the workspace name on blur when changed", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/workspace": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    const input = q("#ws-name") as HTMLInputElement;
    setValue(input, "New name");
    blur(input);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("does not save when the name is unchanged or blank", async () => {
    const fetchMock = jsonFetchFor({});
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    const input = q("#ws-name") as HTMLInputElement;
    blur(input);
    setValue(input, "   ");
    blur(input);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reverts and toasts when saving the workspace name fails", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({ "PATCH /api/workspace": { status: 500 } }),
    );
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    const input = q("#ws-name") as HTMLInputElement;
    setValue(input, "New name");
    blur(input);
    await flush();
    expect(container.textContent).toContain("Couldn't save workspace name");
    expect((q("#ws-name") as HTMLInputElement).value).toBe("Acme");
  });

  it("shows the logo image when a logoUrl is given, else initials", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(
      <SettingsPage {...baseProps({ logoUrl: "https://minio/logo.png" })} />,
    );
    await flush();
    expect(q("img")).toBeTruthy();
    act(() => root.render(<SettingsPage {...baseProps()} />));
    await flush();
    expect(q("img")).toBeNull();
    expect(q('[class*="logo"]')?.textContent).toBe("A");
  });

  it("uploads a new logo end to end", async () => {
    const fetchMock = jsonFetchFor({
      "PATCH /api/workspace/logo": {
        body: { url: "https://minio/put", key: "logos/x.png" },
      },
      "PUT https://minio/put": { body: {} },
      "PATCH /api/workspace": { body: {} },
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    const input = container.querySelector(
      ".logo input[type=file]",
    ) as HTMLInputElement | null;
    const fileInput =
      input ??
      (qAll('input[type="file"]').find((el) =>
        el.closest("label")?.className.includes("logo"),
      ) as HTMLInputElement);
    const file = new File(["x"], "logo.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    act(() => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent).toContain("Workspace logo uploaded");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an error toast when the logo upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({ "PATCH /api/workspace/logo": { status: 500 } }),
    );
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    const fileInput = qAll('input[type="file"]').find((el) =>
      el.closest("label")?.className.includes("logo"),
    ) as HTMLInputElement;
    const file = new File(["x"], "logo.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    act(() => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent).toContain("Couldn't upload that logo");
  });

  it("does nothing when the file input change fires with no file", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    const fileInput = qAll('input[type="file"]').find((el) =>
      el.closest("label")?.className.includes("logo"),
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [] });
    act(() => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent).not.toContain("uploaded");
  });

  it("shows an error toast when the presigned PUT itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({
        "PATCH /api/workspace/logo": {
          body: { url: "https://minio/put", key: "logos/x.png" },
        },
        "PUT https://minio/put": { status: 500 },
      }),
    );
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    const fileInput = qAll('input[type="file"]').find((el) =>
      el.closest("label")?.className.includes("logo"),
    ) as HTMLInputElement;
    const file = new File(["x"], "logo.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    act(() => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent).toContain("Couldn't upload that logo");
  });

  it("flips SSO, AI, auto-delete and audit-log toggles when an admin", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/workspace": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    for (const label of [
      "Single sign-on",
      "AI",
      "Auto-delete old Rewinds",
      "Audit logs",
    ]) {
      const toggle = container.querySelector(
        `button[aria-label="${label}"]`,
      ) as HTMLElement;
      click(toggle);
    }
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not flip toggles for a non-admin", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps({ role: "Viewer" })} />);
    await flush();
    const toggle = container.querySelector(
      'button[aria-label="Single sign-on"]',
    ) as HTMLElement;
    click(toggle);
    await flush();
    expect(
      (container.querySelector("select") as HTMLSelectElement).disabled,
    ).toBe(true);
  });

  it("changes default link access", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/workspace": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    const select = container.querySelector("select") as HTMLSelectElement;
    setValue(select, "members");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("hides SSO/auto-delete/audit-logs and AI rows when their flags are off", async () => {
    Object.assign(mockFlags, { SSO_AUDIT_AUTODEL: false, AI_SUMMARY: false });
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps()} />);
    await flush();
    expect(container.textContent).not.toContain("Single sign-on");
    expect(container.textContent).not.toContain("Audit logs");
    expect(container.textContent).not.toContain("Data");
  });
});

describe("members tab", () => {
  function membersProps(overrides: Record<string, unknown> = {}) {
    return baseProps({ tab: "members", ...overrides });
  }

  it("shows the invite link box and copies the link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "Copy link"));
    await flush();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/team-invite/abc123XYZ01"),
    );
    expect(container.textContent).toContain("Link copied");
  });

  it("renders the invite link box without a global location (SSR)", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    vi.stubGlobal("location", undefined);
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    expect(container.textContent).toContain("/team-invite/abc123XYZ01");
    vi.unstubAllGlobals();
  });

  it("shows an error toast when copying the invite link fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "Copy link"));
    await flush();
    expect(container.textContent).toContain("Couldn't copy link");
  });

  it("hides the invite link box when disabled and toggles it on", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/workspace": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(
      <SettingsPage
        {...membersProps({
          workspace: workspace({ inviteLinkEnabled: false }),
        })}
      />,
    );
    await flush();
    expect(container.textContent).not.toContain("team-invite");
    click(
      container.querySelector(
        'button[aria-label="Invite link"]',
      ) as HTMLElement,
    );
    await flush();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("resets the invite link", async () => {
    const fetchMock = jsonFetchFor({
      "POST /api/workspace/invite-code/reset": {
        body: workspace({ inviteCode: "newCode0001" }),
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("a", "Reset link"));
    await flush();
    expect(container.textContent).toContain("Invite link reset");
    expect(container.textContent).toContain("newCode0001");
  });

  it("shows an error toast when resetting the invite link fails", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({
        "POST /api/workspace/invite-code/reset": { status: 500 },
      }),
    );
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("a", "Reset link"));
    await flush();
    expect(container.textContent).toContain("Couldn't reset the invite link");
  });

  it("hides Reset link for a non-admin", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...membersProps({ role: "Viewer" })} />);
    await flush();
    expect(container.textContent).not.toContain("Reset link");
  });

  it("toggles restrict invite access", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/workspace": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(
      container.querySelector(
        'button[aria-label="Restrict invite access"]',
      ) as HTMLElement,
    );
    await flush();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("opens the invite form, sends an invite, and closes it", async () => {
    const fetchMock = jsonFetchFor({
      "POST /api/invites": { body: [{ id: "i1" }] },
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "+ Add members"));
    await flush();
    const emailInput = q(
      'input[placeholder="Separate emails with a space"]',
    ) as HTMLInputElement;
    setValue(emailInput, "new@acme.co");
    const roleSelect = qAll("select").find(
      (s) => (s as HTMLSelectElement).value === "Viewer",
    ) as HTMLSelectElement;
    setValue(roleSelect, "Admin");
    click(byText("button", "Invite"));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invites",
      expect.objectContaining({ method: "POST" }),
    );
    expect(container.textContent).toContain("Invite sent");
    expect(q('input[placeholder="Separate emails with a space"]')).toBeNull();
  });

  it("sends an invite on Enter and reports multiple invites sent", async () => {
    const fetchMock = jsonFetchFor({ "POST /api/invites": { body: [] } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "+ Add members"));
    await flush();
    const emailInput = q(
      'input[placeholder="Separate emails with a space"]',
    ) as HTMLInputElement;
    setValue(emailInput, "a@acme.co b@acme.co");
    act(() => {
      emailInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await flush();
    expect(container.textContent).toContain("Invites sent");
  });

  it("does nothing when Invite is submitted blank", async () => {
    const fetchMock = jsonFetchFor({});
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "+ Add members"));
    await flush();
    const emailInput = q(
      'input[placeholder="Separate emails with a space"]',
    ) as HTMLInputElement;
    act(() => {
      emailInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an error toast when sending an invite fails, and cancel closes the form", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({ "POST /api/invites": { status: 500 } }),
    );
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "+ Add members"));
    await flush();
    setValue(
      q('input[placeholder="Separate emails with a space"]') as HTMLInputElement,
      "a@acme.co",
    );
    click(byText("button", "Invite"));
    await flush();
    expect(container.textContent).toContain("Couldn't send that invite");
    click(byText("button", "Cancel"));
    await flush();
    expect(q('input[placeholder="Separate emails with a space"]')).toBeNull();
  });

  it("changes a member's role and removes a member", async () => {
    const fetchMock = jsonFetchFor({
      "PATCH /api/members/u2": { body: {} },
      "DELETE /api/members/u2": { body: {} },
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    const roleSelects = qAll("select");
    const memberSelect = roleSelects[roleSelects.length - 1] as HTMLSelectElement;
    setValue(memberSelect, "Admin");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/members/u2",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(refresh).toHaveBeenCalled();
    click(byText("button", "Remove"));
    await flush();
    expect(container.textContent).toContain("Member removed");
  });

  it("shows the 409 last-admin error when changing a role fails", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({
        "PATCH /api/members/u2": {
          status: 409,
          body: { error: "Workspace needs at least one Admin" },
        },
      }),
    );
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    const roleSelects = qAll("select");
    setValue(
      roleSelects[roleSelects.length - 1] as HTMLSelectElement,
      "Viewer",
    );
    await flush();
    expect(container.textContent).toContain(
      "Workspace needs at least one Admin",
    );
  });

  it("shows a fallback error and toast when removing a member's request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "Remove"));
    await flush();
    expect(container.textContent).toContain("Couldn't remove that member");
  });

  it("shows a fallback error when the remove response has no error body", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({ "DELETE /api/members/u2": { status: 500 } }),
    );
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "Remove"));
    await flush();
    expect(container.textContent).toContain("Couldn't remove that member");
  });

  it("shows a fallback error when the remove failure response isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 500 })),
    );
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    click(byText("button", "Remove"));
    await flush();
    expect(container.textContent).toContain("Couldn't remove that member");
  });

  it("shows a fallback error when the role-change failure response isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 409 })),
    );
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    const roleSelects = qAll("select");
    setValue(
      roleSelects[roleSelects.length - 1] as HTMLSelectElement,
      "Viewer",
    );
    await flush();
    expect(container.textContent).toContain(
      "Couldn't change that member's role",
    );
  });

  it("shows a fallback error when changing a role's request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    mount(<SettingsPage {...membersProps()} />);
    await flush();
    const roleSelects = qAll("select");
    setValue(
      roleSelects[roleSelects.length - 1] as HTMLSelectElement,
      "Viewer",
    );
    await flush();
    expect(container.textContent).toContain(
      "Couldn't change that member's role",
    );
  });

  it("hides role select and remove for the current user's own row", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(
      <SettingsPage
        {...membersProps({
          members: [member({ userId: "u1", role: "Admin" })],
        })}
      />,
    );
    await flush();
    expect(container.textContent).toContain("Admin");
    expect(qAll("button").some((b) => b.textContent === "Remove")).toBe(
      false,
    );
  });

  it("shows a read-only role for a non-admin viewer", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...membersProps({ role: "Viewer" })} />);
    await flush();
    expect(container.textContent).toContain("Creator");
  });
});

describe("billing tab", () => {
  it("shows plan and usage bars, and toasts on upgrade", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps({ tab: "billing" })} />);
    await flush();
    expect(container.textContent).toContain("Free");
    expect(container.textContent).toContain("3 / 30");
    click(byText("button", "Upgrade ↗"));
    await flush();
    expect(container.textContent).toContain("Pricing isn't set up yet");
  });
});

describe("webhooks tab", () => {
  it("toasts a placeholder on Set up", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps({ tab: "webhooks" })} />);
    await flush();
    click(byText("button", "Set up ↗"));
    await flush();
    expect(container.textContent).toContain("Webhooks aren't set up yet");
  });
});

describe("account tab", () => {
  it("saves first and last name on blur when changed", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/me": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    const first = q("#acct-first") as HTMLInputElement;
    setValue(first, "New");
    blur(first);
    const last = q("#acct-last") as HTMLInputElement;
    setValue(last, "Name");
    blur(last);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not save first/last name when unchanged or blank", async () => {
    const fetchMock = jsonFetchFor({});
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    blur(q("#acct-first") as HTMLElement);
    setValue(q("#acct-last") as HTMLInputElement, "  ");
    blur(q("#acct-last") as HTMLElement);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reverts and toasts when saving a name fails", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({ "PATCH /api/me": { status: 500 } }));
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    const first = q("#acct-first") as HTMLInputElement;
    setValue(first, "New");
    blur(first);
    await flush();
    expect(container.textContent).toContain("Couldn't save first name");
  });

  it("changes role", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/me": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    setValue(q("#acct-role") as HTMLSelectElement, "Design");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("shows a disabled email field", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    expect((q("#acct-email") as HTMLInputElement).disabled).toBe(true);
  });

  it("uploads and removes an avatar", async () => {
    const fetchMock = jsonFetchFor({
      "POST /api/me/avatar": {
        body: { url: "https://minio/put", key: "avatars/a.png" },
      },
      "PUT https://minio/put": { body: {} },
      "PATCH /api/me": { body: {} },
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    const fileInput = q('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    act(() => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent).toContain("Profile picture uploaded");
    act(() =>
      root.render(
        <SettingsPage
          {...baseProps({
            tab: "account",
            avatarUrl: "https://minio/a.png",
          })}
        />,
      ),
    );
    await flush();
    click(byText("button", "Remove"));
    await flush();
    expect(container.textContent).toContain("Profile picture removed");
  });

  it("shows an error toast when the avatar upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({ "POST /api/me/avatar": { status: 500 } }),
    );
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    const fileInput = q('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    act(() => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent).toContain("Couldn't upload that photo");
  });

  it("does nothing when the avatar file input change fires with no file", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({}));
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    const fileInput = q('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [] });
    act(() => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent).not.toContain("uploaded");
  });

  it("toggles theme light/dark and persists it", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/me": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    document.body.className = "";
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    click(byText("button", "Dark"));
    await flush();
    expect(document.body.classList.contains("rw-dark")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ theme: "dark" }) }),
    );
    click(byText("button", "Light"));
    await flush();
    expect(document.body.classList.contains("rw-dark")).toBe(false);
  });

  it("deletes the account after confirming", async () => {
    const assign = vi.fn();
    vi.stubGlobal(
      "location",
      Object.assign(new URL("https://app.rewind.test"), { assign }),
    );
    vi.stubGlobal("fetch", jsonFetchFor({ "DELETE /api/me": { body: {} } }));
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    click(byText("button", "Delete"));
    await flush();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("does nothing when the delete confirmation is cancelled", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const fetchMock = jsonFetchFor({});
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    click(byText("button", "Delete"));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an error and re-enables Delete when deleting the account fails", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetchFor({ "DELETE /api/me": { status: 500 } }),
    );
    mount(<SettingsPage {...baseProps({ tab: "account" })} />);
    await flush();
    click(byText("button", "Delete"));
    await flush();
    expect(container.textContent).toContain("Couldn't delete your account");
    expect((byText("button", "Delete") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("notifications tab", () => {
  it("toggles a single notification", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/me": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps({ tab: "notifications" })} />);
    await flush();
    const toggles = qAll('button[role="switch"]');
    click(toggles[0]!);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("turns off all notifications", async () => {
    const fetchMock = jsonFetchFor({ "PATCH /api/me": { body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SettingsPage {...baseProps({ tab: "notifications" })} />);
    await flush();
    click(byText("button", "Turn off all"));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          notifyN1: false,
          notifyN2: false,
          notifyN3: false,
          notifyN4: false,
          notifyN5: false,
        }),
      }),
    );
    expect(container.textContent).toContain(
      "Email notifications turned off",
    );
  });

  it("reverts and toasts when turning off all notifications fails", async () => {
    vi.stubGlobal("fetch", jsonFetchFor({ "PATCH /api/me": { status: 500 } }));
    mount(<SettingsPage {...baseProps({ tab: "notifications" })} />);
    await flush();
    click(byText("button", "Turn off all"));
    await flush();
    expect(container.textContent).toContain(
      "Couldn't turn off notifications",
    );
    const toggles = qAll('button[role="switch"]');
    expect(toggles[0]!.getAttribute("aria-checked")).toBe("true");
  });
});

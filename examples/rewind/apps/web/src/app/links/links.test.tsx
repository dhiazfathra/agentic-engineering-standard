// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordingLinkListItem } from "@/lib/rewinds";

const { LinksPage } = await import("./links");

function link(
  overrides: Partial<RecordingLinkListItem> = {},
): RecordingLinkListItem {
  return {
    id: "l1",
    workspaceId: "w1",
    name: "Beta testers",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    rewindCount: 14,
    ...overrides,
  } as RecordingLinkListItem;
}

let container: HTMLDivElement;
let root: Root;

function mount(el: React.ReactElement) {
  act(() => {
    root.render(el);
  });
}

function qAll(selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll(selector));
}

function buttonByText(text: string): HTMLElement {
  const btn = qAll("button").find((b) => b.textContent?.trim() === text);
  if (!btn) throw new Error(`no button with text: ${text}`);
  return btn;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
  stubClipboard(vi.fn().mockResolvedValue(undefined));
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("table", () => {
  it("renders one row per link with name, created date and count", async () => {
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    expect(container.textContent).toContain("Beta testers");
    expect(container.textContent).toContain("14");
  });

  it("shows the empty state when there are no links", async () => {
    mount(<LinksPage links={[]} userId="u1" />);
    await flush();
    expect(container.textContent).toContain("No recording links yet");
  });

  it("copies the /rec/[id] url when Copy link is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    click(buttonByText("Copy link"));
    await flush();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/rec/l1"),
    );
    expect(container.textContent).toContain("Link copied");
  });

  it("shows an error toast when copying fails", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    click(buttonByText("Copy link"));
    await flush();
    expect(container.textContent).toContain("Couldn't copy link");
  });
});

describe("new recording link", () => {
  it("creates a link named after the current count, copies it, and prepends it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "l2",
          workspaceId: "w1",
          name: "New recording link 2",
          createdAt: new Date().toISOString(),
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    click(buttonByText("New recording link"));
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recording-links",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New recording link 2" }),
      }),
    );
    expect(container.textContent).toContain("New recording link 2");
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/rec/l2"),
    );
  });

  it("shows an error toast when creation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    click(buttonByText("New recording link"));
    await flush();
    expect(container.textContent).toContain("Couldn't create recording link");
  });

  it("shows an error toast when the create request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    click(buttonByText("New recording link"));
    await flush();
    expect(container.textContent).toContain("Couldn't create recording link");
  });
});

describe("SDK flag", () => {
  it("hides the domain button when the SDK flag is off", async () => {
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    expect(
      container.querySelector('[aria-label="Connect your domain"]'),
    ).toBeNull();
  });
});

describe("onboarding modal", () => {
  it("opens on first visit and dismisses per user in localStorage", async () => {
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    expect(container.textContent).toContain("no extension needed");
    click(buttonByText("Got it"));
    expect(localStorage.getItem("rw-links-onboarding-dismissed-u1")).toBe(
      "1",
    );
    expect(container.textContent).not.toContain("no extension needed");
  });

  it("stays closed on a later visit once dismissed", async () => {
    localStorage.setItem("rw-links-onboarding-dismissed-u1", "1");
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    expect(container.textContent).not.toContain("no extension needed");
  });

  it("skips onboarding when localStorage.getItem throws", async () => {
    const getItem = vi
      .spyOn(window.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    mount(<LinksPage links={[link()]} userId="u1" />);
    await flush();
    expect(container.textContent).not.toContain("no extension needed");
    getItem.mockRestore();
  });

  it("is scoped per user: a different user still sees it", async () => {
    localStorage.setItem("rw-links-onboarding-dismissed-u1", "1");
    mount(<LinksPage links={[link()]} userId="u2" />);
    await flush();
    expect(container.textContent).toContain("no extension needed");
  });
});

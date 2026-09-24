// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderListItem, RewindListItem } from "@/lib/rewinds";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const { Library } = await import("./library");

function rewind(overrides: Partial<RewindListItem> = {}): RewindListItem {
  return {
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
    createdAt: new Date(Date.now() - 5 * 60_000),
    updatedAt: new Date(),
    errorCount: 0,
    ...overrides,
  } as RewindListItem;
}

function folder(overrides: Partial<FolderListItem> = {}): FolderListItem {
  return { id: "f1", name: "Checkout bugs", ...overrides } as FolderListItem;
}

let container: HTMLDivElement;
let root: Root;

function mount(el: React.ReactElement) {
  act(() => {
    root.render(el);
  });
}

function q(selector: string): HTMLElement {
  const el = container.querySelector(selector);
  if (!el) throw new Error(`not found: ${selector}`);
  return el as HTMLElement;
}

function qAll(selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll(selector));
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

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  replace.mockReset();
  stubClipboard(vi.fn().mockResolvedValue(undefined));
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("cards", () => {
  it("renders a card per Rewind, linking to its viewer", () => {
    mount(
      <Library
        rewinds={[rewind()]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
    expect(container.textContent).toContain(
      "Checkout fails after applying coupon",
    );
    const link = q('a[href="/r/seed-r1"]');
    expect(link).toBeTruthy();
  });

  it("shows a dash for a screenshot with no duration", () => {
    mount(
      <Library
        rewinds={[rewind({ kind: "screenshot", durationSeconds: null })]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
    expect(container.textContent).toContain("—");
  });

  it("shows the count of shown Rewinds", () => {
    mount(
      <Library
        rewinds={[rewind(), rewind({ id: "seed-r2" })]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
    expect(container.textContent).toContain("2 Rewinds");
  });
});

describe("view segment", () => {
  it("calls router.replace with the right URL for each view", () => {
    mount(
      <Library
        rewinds={[rewind()]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
    const radios = qAll('[role="radio"]');
    click(radios.find((r) => r.textContent === "Board")!);
    expect(replace).toHaveBeenCalledWith("/?view=board");

    click(radios.find((r) => r.textContent === "List")!);
    expect(replace).toHaveBeenCalledWith("/?view=list");

    click(radios.find((r) => r.textContent === "Grid")!);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("marks the current view selected", () => {
    mount(
      <Library rewinds={[]} folders={[]} view="board" folderId={undefined} />,
    );
    const radios = qAll('[role="radio"]');
    const board = radios.find((r) => r.textContent === "Board")!;
    expect(board.getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the folder param when switching views", () => {
    mount(
      <Library
        rewinds={[rewind({ folderId: "f1" })]}
        folders={[folder()]}
        view="grid"
        folderId="f1"
      />,
    );
    click(qAll('[role="radio"]').find((r) => r.textContent === "Board")!);
    expect(replace).toHaveBeenCalledWith("/?view=board&folder=f1");
  });
});

describe("folder filter", () => {
  it("filters to a folder's Rewinds on click and shows its title", () => {
    mount(
      <Library
        rewinds={[
          rewind({ id: "in", folderId: "f1" }),
          rewind({ id: "out", folderId: null }),
        ]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    click(
      qAll("button").find((b) => b.textContent?.includes("Checkout bugs"))!,
    );
    expect(replace).toHaveBeenCalledWith("/?folder=f1");
  });

  it("shows the folder's own Rewinds and title when already filtered", () => {
    mount(
      <Library
        rewinds={[
          rewind({ id: "in", folderId: "f1" }),
          rewind({ id: "out", folderId: null }),
        ]}
        folders={[folder()]}
        view="grid"
        folderId="f1"
      />,
    );
    expect(container.textContent).toContain("Checkout bugs");
    expect(container.textContent).toContain("1 Rewinds");
    expect(q('a[href="/r/in"]')).toBeTruthy();
    expect(container.querySelector('a[href="/r/out"]')).toBeNull();
  });

  it('shows "Folder not found" for an unknown folder id and no Rewinds', () => {
    mount(
      <Library
        rewinds={[rewind()]}
        folders={[]}
        view="grid"
        folderId="missing"
      />,
    );
    expect(container.textContent).toContain("Folder not found");
    expect(container.textContent).toContain("0 Rewinds");
  });

  it("returns to All Rewinds from the sidebar", () => {
    mount(
      <Library
        rewinds={[rewind({ folderId: "f1" })]}
        folders={[folder()]}
        view="grid"
        folderId="f1"
      />,
    );
    click(qAll("button").find((b) => b.textContent === "All Rewinds")!);
    expect(replace).toHaveBeenCalledWith("/");
  });
});

describe("copy link", () => {
  it("copies the link and shows a toast", async () => {
    mount(
      <Library
        rewinds={[rewind()]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
    const button = q('[aria-label="Copy link"]');
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Link copied");
  });

  it("shows an error toast when the copy fails", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    mount(
      <Library
        rewinds={[rewind()]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
    const button = q('[aria-label="Copy link"]');
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Could not copy link");
  });
});

describe("list view", () => {
  it("renders a row per Rewind with the design's columns", () => {
    mount(
      <Library
        rewinds={[rewind(), rewind({ id: "shot", durationSeconds: null })]}
        folders={[]}
        view="list"
        folderId={undefined}
      />,
    );
    const heads = qAll('[role="columnheader"]').map((h) => h.textContent);
    expect(heads).toEqual([
      "Title",
      "Page",
      "Reporter",
      "Length",
      "Status",
      "",
    ]);
    expect(qAll('[role="row"]')).toHaveLength(3);
    expect(q('a[href="/r/seed-r1"]').textContent).toBe(
      "Checkout fails after applying coupon",
    );
    expect(container.textContent).toContain("Maya Chen");
    expect(container.textContent).toContain("0:42");
    expect(container.textContent).toContain("—");
    expect(container.textContent).toContain("New");
    expect(qAll('[aria-label="Copy link"]')).toHaveLength(2);
  });
});

describe("board view", () => {
  it("renders four columns with counts, error labels and empty drop zones", () => {
    mount(
      <Library
        rewinds={[
          rewind({ id: "a", errorCount: 3 }),
          rewind({ id: "b", errorCount: 1 }),
          rewind({ id: "c", status: "done", durationSeconds: null }),
        ]}
        folders={[]}
        view="board"
        folderId={undefined}
      />,
    );
    const cols = qAll("section");
    expect(cols.map((c) => c.getAttribute("aria-label"))).toEqual([
      "New",
      "Triaging",
      "In progress",
      "Fixed",
    ]);
    expect(cols[0].textContent).toContain("New2");
    expect(cols[0].textContent).toContain("3 errors");
    expect(cols[0].textContent).toContain("1 error");
    expect(cols[3].textContent).not.toContain("error");
    expect(cols[1].textContent).toContain("Drop Rewinds here");
    expect(cols[2].textContent).toContain("Drop Rewinds here");
    expect(cols[0].textContent).not.toContain("Drop Rewinds here");
    expect(cols[0].querySelector('a[href="/r/a"]')).toBeTruthy();
  });
});

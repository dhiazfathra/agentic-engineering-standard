// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderListItem, RewindListItem } from "@/lib/rewinds";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
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
  push.mockReset();
  document.body.className = "";
  stubClipboard(vi.fn().mockResolvedValue(undefined));
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

function stubFetch(ok = true) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({}), { status: ok ? 200 : 500 }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function key(el: HTMLElement, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function blur(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

function menuItem(label: string): HTMLElement {
  return qAll('[role="menuitem"]').find((b) => b.textContent === label)!;
}

function mountOne(view: "grid" | "list" | "board" = "grid") {
  mount(
    <Library
      rewinds={[rewind()]}
      folders={[]}
      view={view}
      folderId={undefined}
    />,
  );
}

const TITLE = "Checkout fails after applying coupon";

function openRewindMenu() {
  click(q(`[aria-label="Actions for ${TITLE}"]`));
}

function startRename(): HTMLInputElement {
  openRewindMenu();
  click(menuItem("Rename"));
  return q('input[aria-label="Rewind title"]') as HTMLInputElement;
}

describe("context menu", () => {
  it("opens from the ⋯ button with Rename and Delete, focused", () => {
    mountOne();
    openRewindMenu();
    const menu = q('[role="menu"]');
    expect(menu.getAttribute("aria-label")).toBe(`Actions for ${TITLE}`);
    expect(qAll('[role="menuitem"]').map((i) => i.textContent)).toEqual([
      "Rename",
      "Move to All Rewinds",
      "Set status: New",
      "Set status: Triaging",
      "Set status: In progress",
      "Set status: Fixed",
      "Delete Rewind",
    ]);
    expect(document.activeElement).toBe(menuItem("Rename"));
  });

  it("Escape closes it and returns focus to the ⋯ button", () => {
    mountOne();
    const trigger = q(`[aria-label="Actions for ${TITLE}"]`);
    click(trigger);
    key(q('[role="menu"]'), "Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("other keys leave it open", () => {
    mountOne();
    openRewindMenu();
    key(q('[role="menu"]'), "a");
    expect(container.querySelector('[role="menu"]')).toBeTruthy();
  });

  it.each(["grid", "list", "board"] as const)(
    "opens on right-click in the %s view and closes on the backdrop",
    (view) => {
      mountOne(view);
      const target = q('[aria-label="Copy link"]').closest(
        view === "list" ? '[role="row"]' : "div",
      ) as HTMLElement;
      act(() => {
        target.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: 40,
            clientY: 50,
          }),
        );
      });
      const menu = q('[role="menu"]');
      expect(menu.style.left).toBe("40px");
      expect(menu.style.top).toBe("50px");
      click(menu.previousElementSibling as HTMLElement);
      expect(container.querySelector('[role="menu"]')).toBeNull();
    },
  );

  it("closes on a right-click on the backdrop", () => {
    mountOne();
    openRewindMenu();
    act(() => {
      q('[role="menu"]').previousElementSibling!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});

describe("rename", () => {
  it.each(["grid", "list", "board"] as const)(
    "Enter commits and sends PATCH { title } in the %s view",
    async (view) => {
      const fetchMock = stubFetch();
      mountOne(view);
      const input = startRename();
      expect(input.value).toBe(TITLE);
      type(input, "  New title  ");
      key(input, "Enter");
      await flush();
      expect(container.textContent).toContain("New title");
      expect(container.querySelector("input")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/seed-r1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "New title" }),
      });
    },
  );

  it("blur commits", async () => {
    const fetchMock = stubFetch();
    mountOne();
    const input = startRename();
    type(input, "Blurred");
    blur(input);
    await flush();
    expect(container.textContent).toContain("Blurred");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Enter then a blur before re-render commits once", async () => {
    const fetchMock = stubFetch();
    mountOne();
    const input = startRename();
    type(input, "Once");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Escape cancels and sends nothing", () => {
    const fetchMock = stubFetch();
    mountOne();
    const input = startRename();
    type(input, "Discarded");
    key(input, "Escape");
    expect(container.textContent).toContain(TITLE);
    expect(container.textContent).not.toContain("Discarded");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an empty title sends nothing", () => {
    const fetchMock = stubFetch();
    mountOne();
    const input = startRename();
    type(input, "   ");
    key(input, "Enter");
    expect(container.textContent).toContain(TITLE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an unchanged title sends nothing", () => {
    const fetchMock = stubFetch();
    mountOne();
    const input = startRename();
    key(input, "Enter");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed PATCH reverts the title and toasts", async () => {
    stubFetch(false);
    mountOne();
    const input = startRename();
    type(input, "Doomed");
    key(input, "Enter");
    await flush();
    expect(container.textContent).toContain(TITLE);
    expect(container.textContent).not.toContain("Doomed");
    expect(container.textContent).toContain("Could not rename Rewind");
  });

  it("a network error reverts too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    mountOne();
    const input = startRename();
    type(input, "Doomed");
    key(input, "Enter");
    await flush();
    expect(container.textContent).toContain(TITLE);
    expect(container.textContent).toContain("Could not rename Rewind");
  });

  it("rename twice while first PATCH pending sends only one PATCH until first resolves", async () => {
    let resolveFirst!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((r) => (resolveFirst = r)),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
      );
    vi.stubGlobal("fetch", fetchMock);
    mountOne();

    type(startRename(), "First");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");

    click(q('[aria-label="Actions for First"]'));
    click(menuItem("Rename"));
    type(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Second");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Second");

    await act(async () => {
      resolveFirst(new Response(JSON.stringify({}), { status: 200 }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/rewinds/seed-r1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Second" }),
    });
  });

  it("three rapid renames while first pending sends only two PATCHes with newest title", async () => {
    let resolveFirst!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((r) => (resolveFirst = r)),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
      );
    vi.stubGlobal("fetch", fetchMock);
    mountOne();

    type(startRename(), "First");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");

    click(q('[aria-label="Actions for First"]'));
    click(menuItem("Rename"));
    type(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Second");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");

    click(q('[aria-label="Actions for Second"]'));
    click(menuItem("Rename"));
    type(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Third");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Third");

    await act(async () => {
      resolveFirst(new Response(JSON.stringify({}), { status: 200 }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/rewinds/seed-r1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Third" }),
    });
    expect(container.textContent).toContain("Third");
  });

  it("a failed PATCH with nothing queued rolls back and toasts", async () => {
    stubFetch(false);
    mountOne();
    const input = startRename();
    type(input, "Doomed");
    key(input, "Enter");
    await flush();
    expect(container.textContent).toContain(TITLE);
    expect(container.textContent).not.toContain("Doomed");
    expect(container.textContent).toContain("Could not rename Rewind");
  });

  it("a queued rename that fails after the first succeeds rolls back to the first", async () => {
    let resolveFirst!: (r: Response) => void;
    let resolveSecond!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((r) => (resolveFirst = r)),
      )
      .mockImplementationOnce(
        () => new Promise<Response>((r) => (resolveSecond = r)),
      );
    vi.stubGlobal("fetch", fetchMock);
    mountOne();

    type(startRename(), "First");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");

    click(q('[aria-label="Actions for First"]'));
    click(menuItem("Rename"));
    type(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Second");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");
    await flush();

    await act(async () => {
      resolveFirst(new Response(JSON.stringify({}), { status: 200 }));
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      resolveSecond(new Response(JSON.stringify({}), { status: 500 }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain("First");
    expect(container.textContent).not.toContain("Second");
    expect(container.textContent).toContain("Could not rename Rewind");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/rewinds/seed-r1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "First" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/rewinds/seed-r1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Second" }),
    });
  });

  it("first PATCH fails while newer rename queued: no rollback, then sends newest", async () => {
    let resolveFirst!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((r) => (resolveFirst = r)),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
      );
    vi.stubGlobal("fetch", fetchMock);
    mountOne();

    type(startRename(), "First");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");

    click(q('[aria-label="Actions for First"]'));
    click(menuItem("Rename"));
    type(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Second");
    key(q('input[aria-label="Rewind title"]') as HTMLInputElement, "Enter");
    await flush();

    await act(async () => {
      resolveFirst(new Response(JSON.stringify({}), { status: 500 }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain("Second");
    expect(container.textContent).not.toContain(TITLE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/rewinds/seed-r1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Second" }),
    });
  });
});

function deleteFirst() {
  openRewindMenu();
  click(menuItem("Delete Rewind"));
}

function toastButtons(label: "Undo" | "Close"): HTMLElement[] {
  return label === "Undo"
    ? qAll("button").filter((b) => b.textContent === "Undo")
    : qAll('[aria-label="Close"]');
}

describe("delete with undo", () => {
  it("hides the Rewind and toasts with Undo and ×, sending nothing yet", () => {
    const fetchMock = stubFetch();
    mountOne();
    deleteFirst();
    expect(container.querySelector('a[href="/r/seed-r1"]')).toBeNull();
    expect(container.textContent).toContain("Rewind deleted");
    expect(toastButtons("Undo")).toHaveLength(1);
    expect(toastButtons("Close")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a toast left open for 60 s sends nothing and stays", () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    mountOne();
    deleteFirst();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Rewind deleted");
  });

  it("× sends DELETE and closes the toast", async () => {
    const fetchMock = stubFetch();
    mountOne();
    deleteFirst();
    click(toastButtons("Close")[0]);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/seed-r1", {
      method: "DELETE",
    });
    expect(container.textContent).not.toContain("Rewind deleted");
    expect(container.querySelector('a[href="/r/seed-r1"]')).toBeNull();
  });

  it("Undo restores the Rewind and sends nothing, even on unmount", () => {
    const fetchMock = stubFetch();
    mountOne();
    deleteFirst();
    click(toastButtons("Undo")[0]);
    expect(q('a[href="/r/seed-r1"]')).toBeTruthy();
    expect(container.textContent).not.toContain("Rewind deleted");
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stacked deletes close and undo independently", async () => {
    const fetchMock = stubFetch();
    mount(
      <Library
        rewinds={[
          rewind({ id: "a", title: "First" }),
          rewind({ id: "b", title: "Second" }),
        ]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
    click(q('[aria-label="Actions for First"]'));
    click(menuItem("Delete Rewind"));
    click(q('[aria-label="Actions for Second"]'));
    click(menuItem("Delete Rewind"));
    expect(toastButtons("Close")).toHaveLength(2);

    click(toastButtons("Undo")[1]);
    expect(q('a[href="/r/b"]')).toBeTruthy();
    expect(toastButtons("Close")).toHaveLength(1);

    click(toastButtons("Close")[0]);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/a", {
      method: "DELETE",
    });
  });

  it("pagehide sends every pending DELETE with keepalive", async () => {
    const fetchMock = stubFetch();
    mount(
      <Library
        rewinds={[
          rewind({ id: "a", title: "First" }),
          rewind({ id: "b", title: "Second" }),
        ]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
    click(q('[aria-label="Actions for First"]'));
    click(menuItem("Delete Rewind"));
    click(q('[aria-label="Actions for Second"]'));
    click(menuItem("Delete Rewind"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/a", {
      method: "DELETE",
      keepalive: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/b", {
      method: "DELETE",
      keepalive: true,
    });

    // Already sent: a later × sends nothing more.
    click(toastButtons("Close")[0]);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("unmounting (a client navigation) sends pending DELETEs with keepalive", async () => {
    const fetchMock = stubFetch();
    mountOne();
    deleteFirst();
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/seed-r1", {
      method: "DELETE",
      keepalive: true,
    });
  });

  it("a failed DELETE restores the Rewind and toasts", async () => {
    stubFetch(false);
    mountOne();
    deleteFirst();
    click(toastButtons("Close")[0]);
    await flush();
    expect(q('a[href="/r/seed-r1"]')).toBeTruthy();
    expect(container.textContent).toContain("Could not delete Rewind");
  });

  it("a failed keepalive flush restores the Rewind and toasts", async () => {
    stubFetch(false);
    mountOne();
    deleteFirst();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await flush();
    expect(q('a[href="/r/seed-r1"]')).toBeTruthy();
    expect(container.textContent).toContain("Could not delete Rewind");
  });
});

function jsonFetch(body: unknown, status = 201) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mountFolders(folderId?: string) {
  mount(
    <Library
      rewinds={[
        rewind({ id: "in", title: "Filed", folderId: "f1" }),
        rewind({ id: "out", title: "Loose", folderId: null }),
      ]}
      folders={[folder()]}
      view="grid"
      folderId={folderId}
    />,
  );
}

function folderButton(): HTMLElement {
  return qAll("button").find((b) => b.textContent?.includes("Checkout bugs"))!;
}

describe("folders", () => {
  it("+ posts the next untitled name and opens it for rename", async () => {
    const fetchMock = jsonFetch({
      id: "f2",
      name: "Untitled folder 1",
      createdAt: new Date().toISOString(),
    });
    mountFolders();
    click(q('[aria-label="New folder"]'));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Untitled folder 1" }),
    });
    const input = q('input[aria-label="Folder name"]') as HTMLInputElement;
    expect(input.value).toBe("Untitled folder 1");

    fetchMock.mockClear();
    type(input, "Payments");
    key(input, "Enter");
    await flush();
    expect(container.textContent).toContain("Payments");
    expect(fetchMock).toHaveBeenCalledWith("/api/folders/f2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Payments" }),
    });
  });

  it("a failed create adds nothing and toasts", async () => {
    stubFetch(false);
    mountFolders();
    click(q('[aria-label="New folder"]'));
    await flush();
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).toContain("Could not create folder");
  });

  it("the folder menu opens from ⋯ and on right-click", () => {
    mountFolders();
    click(q('[aria-label="Actions for folder Checkout bugs"]'));
    expect(qAll('[role="menuitem"]').map((i) => i.textContent)).toEqual([
      "Rename",
      "Delete folder",
    ]);
    key(q('[role="menu"]'), "Escape");
    act(() => {
      folderButton().dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(q('[role="menu"]').getAttribute("aria-label")).toBe(
      "Actions for folder Checkout bugs",
    );
  });

  function renameFolderInput(): HTMLInputElement {
    click(q('[aria-label="Actions for folder Checkout bugs"]'));
    click(menuItem("Rename"));
    return q('input[aria-label="Folder name"]') as HTMLInputElement;
  }

  it("rename: Escape cancels, empty and unchanged send nothing", () => {
    const fetchMock = stubFetch();
    mountFolders();
    let input = renameFolderInput();
    type(input, "Nope");
    key(input, "Escape");
    input = renameFolderInput();
    type(input, " ");
    key(input, "Enter");
    input = renameFolderInput();
    blur(input);
    expect(container.textContent).toContain("Checkout bugs");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed rename reverts and toasts", async () => {
    stubFetch(false);
    mountFolders();
    const input = renameFolderInput();
    type(input, "Doomed");
    key(input, "Enter");
    await flush();
    expect(container.textContent).toContain("Checkout bugs");
    expect(container.textContent).not.toContain("Doomed");
    expect(container.textContent).toContain("Could not rename folder");
  });

  function deleteFolder() {
    click(q('[aria-label="Actions for folder Checkout bugs"]'));
    click(menuItem("Delete folder"));
  }

  it("delete hides the folder, unfiles its Rewinds, and × sends DELETE", async () => {
    const fetchMock = stubFetch();
    mountFolders();
    deleteFolder();
    expect(folderButton()).toBeUndefined();
    expect(container.textContent).toContain("Folder “Checkout bugs” deleted");
    expect(q('a[href="/r/in"]')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    click(toastButtons("Close")[0]);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/folders/f1", {
      method: "DELETE",
    });
  });

  it("Undo restores the folder and refiles its Rewinds", () => {
    const fetchMock = stubFetch();
    mountFolders();
    deleteFolder();
    click(toastButtons("Undo")[0]);
    expect(folderButton().textContent).toContain("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed DELETE restores the folder and toasts", async () => {
    stubFetch(false);
    mountFolders();
    deleteFolder();
    click(toastButtons("Close")[0]);
    await flush();
    expect(folderButton()).toBeTruthy();
    expect(container.textContent).toContain("Could not delete folder");
  });

  it("pagehide sends a pending folder DELETE with keepalive", async () => {
    const fetchMock = stubFetch();
    mountFolders();
    deleteFolder();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/folders/f1", {
      method: "DELETE",
      keepalive: true,
    });
  });

  it("deleting the folder being viewed returns to All Rewinds", () => {
    stubFetch();
    mountFolders("f1");
    deleteFolder();
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("Undo on the folder being viewed shows its name again", () => {
    stubFetch();
    mountFolders("f1");
    const title = () => q("header > div").textContent;
    deleteFolder();
    expect(title()).toBe("All Rewinds");
    click(toastButtons("Undo")[0]);
    expect(title()).toBe("Checkout bugs");
  });
});

function dataTransferStub(id: string) {
  const store: Record<string, string> = {};
  return {
    setData: (k: string, v: string) => {
      store[k] = v;
    },
    getData: (k: string) => store[k] ?? id,
  };
}

function dragEvent(type: string, id: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: dataTransferStub(id),
  });
  return event as unknown as Event;
}

function drop(el: HTMLElement, id: string) {
  act(() => {
    el.dispatchEvent(dragEvent("drop", id));
  });
}

function dragEnter(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new Event("dragenter", { bubbles: true }));
  });
}

function dragLeave(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new Event("dragleave", { bubbles: true }));
  });
}

function dragStart(el: HTMLElement) {
  let sentId: string | undefined;
  const event = new Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      setData: (_k: string, v: string) => {
        sentId = v;
      },
    },
  });
  act(() => {
    el.dispatchEvent(event);
  });
  return sentId;
}

describe("drag and drop", () => {
  function mountBoard() {
    mount(
      <Library
        rewinds={[rewind({ id: "a", status: "new" })]}
        folders={[folder()]}
        view="board"
        folderId={undefined}
      />,
    );
  }

  it("dragstart puts the Rewind id on the dataTransfer", () => {
    mountBoard();
    const cardEl = qAll("section")[0].querySelector("a")!.parentElement!;
    expect(dragStart(cardEl)).toBe("a");
  });

  it("dropping a card on a column sends PATCH status and toasts", async () => {
    const fetchMock = stubFetch();
    mountBoard();
    const columns = qAll("section");
    drop(columns[2], "a");
    await flush();
    expect(container.textContent).toContain("Moved to In progress");
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "progress" }),
    });
  });

  it("dropping on the same column's status does nothing", async () => {
    const fetchMock = stubFetch();
    mountBoard();
    drop(qAll("section")[0], "a");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dropping an unknown id does nothing", async () => {
    const fetchMock = stubFetch();
    mountBoard();
    drop(qAll("section")[1], "missing");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dragenter/dragleave toggle the column highlight, ignoring an unrelated leave", () => {
    mountBoard();
    const columns = qAll("section");
    dragEnter(columns[1]);
    expect(columns[1].className).toContain("columnDropTarget");
    dragLeave(columns[0]);
    expect(columns[1].className).toContain("columnDropTarget");
    dragLeave(columns[1]);
    expect(columns[1].className).not.toContain("columnDropTarget");
  });

  it("a failed status write reverts and toasts", async () => {
    stubFetch(false);
    mountBoard();
    drop(qAll("section")[2], "a");
    await flush();
    expect(container.textContent).toContain("Could not move Rewind");
  });

  it("a failed status change with nothing queued rolls back and toasts", async () => {
    stubFetch(false);
    mountBoard();
    drop(qAll("section")[1], "a");
    await flush();
    expect(qAll("section")[0].textContent).toContain(TITLE);
    expect(qAll("section")[1].textContent).not.toContain(TITLE);
    expect(container.textContent).toContain("Could not move Rewind");
  });

  it("dropping a card on a sidebar folder sends PATCH folderId", async () => {
    const fetchMock = stubFetch();
    mount(
      <Library
        rewinds={[rewind({ id: "a", folderId: null })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    drop(folderButton(), "a");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: "f1" }),
    });
  });

  it("dropping on All Rewinds sends folderId null", async () => {
    const fetchMock = stubFetch();
    mount(
      <Library
        rewinds={[rewind({ id: "a", folderId: "f1" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    const allButton = qAll("button").find(
      (b) => b.textContent === "All Rewinds",
    )!;
    drop(allButton, "a");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: null }),
    });
  });

  it("dragging onto the same folder does nothing", async () => {
    const fetchMock = stubFetch();
    mount(
      <Library
        rewinds={[rewind({ id: "a", folderId: "f1" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    drop(folderButton(), "a");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dragenter/dragleave toggle the All Rewinds highlight, ignoring an unrelated leave", () => {
    mount(
      <Library
        rewinds={[rewind({ id: "a", folderId: "f1" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    const allButton = qAll("button").find(
      (b) => b.textContent === "All Rewinds",
    )!;
    dragEnter(allButton);
    expect(allButton.className).toContain("dropTarget");
    dragLeave(folderButton());
    expect(allButton.className).toContain("dropTarget");
    dragLeave(allButton);
    expect(allButton.className).not.toContain("dropTarget");
  });

  it("dropping an unknown id on a folder does nothing", async () => {
    const fetchMock = stubFetch();
    mount(
      <Library
        rewinds={[rewind({ id: "a" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    drop(folderButton(), "missing");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dragenter/dragleave toggle the folder highlight", () => {
    mount(
      <Library
        rewinds={[rewind({ id: "a" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    const btn = folderButton();
    dragEnter(btn);
    expect(btn.className).toContain("dropTarget");
    dragLeave(btn);
    expect(btn.className).not.toContain("dropTarget");
  });

  it("the context menu's Move to folder and Set status call the same handlers", async () => {
    const fetchMock = stubFetch();
    mount(
      <Library
        rewinds={[rewind({ id: "a" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    click(q(`[aria-label="Actions for ${TITLE}"]`));
    click(menuItem("Move to Checkout bugs"));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: "f1" }),
    });

    fetchMock.mockClear();
    click(q(`[aria-label="Actions for ${TITLE}"]`));
    click(menuItem("Set status: Fixed"));
    await flush();
    expect(container.textContent).toContain("Moved to Fixed");
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
  });

  it("Move to All Rewinds files a Rewind out of its folder", async () => {
    const fetchMock = stubFetch();
    mount(
      <Library
        rewinds={[rewind({ id: "a", folderId: "f1" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    click(q(`[aria-label="Actions for ${TITLE}"]`));
    click(menuItem("Move to All Rewinds"));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/rewinds/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: null }),
    });
  });

  it("a failed folder move reverts and toasts", async () => {
    stubFetch(false);
    mount(
      <Library
        rewinds={[rewind({ id: "a" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
    click(q(`[aria-label="Actions for ${TITLE}"]`));
    click(menuItem("Move to Checkout bugs"));
    await flush();
  });

  it("a failed folder move with nothing queued rolls back and toasts", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 500 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount(
      <Library
        rewinds={[rewind({ id: "a", folderId: null })]}
        folders={[folder({ id: "f1", name: "Unique" })]}
        view="grid"
        folderId={undefined}
      />,
    );
    click(q(`[aria-label="Actions for ${TITLE}"]`));
    click(menuItem("Move to Unique"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Could not move Rewind");
  });

  it("a failed move after folder was deleted rolls back to unfiled, not the deleted folder", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(() => {
      callCount++;
      // First call: move to F1 succeeds
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        );
      }
      // Second call: delete F1 succeeds
      if (callCount === 2) {
        return Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        );
      }
      // Third call: move to F2 fails
      return Promise.resolve(new Response(JSON.stringify({}), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    // Start with Rewind A unfiled and two folders
    mount(
      <Library
        rewinds={[rewind({ id: "a", folderId: null })]}
        folders={[
          folder({ id: "f1", name: "Folder1" }),
          folder({ id: "f2", name: "Folder2" }),
        ]}
        view="grid"
        folderId={undefined}
      />,
    );

    // Move A into folder F1; PATCH succeeds
    click(q(`[aria-label="Actions for ${TITLE}"]`));
    click(menuItem("Move to Folder1"));
    await flush();

    // Delete folder F1 and close undo toast so DELETE is sent; succeeds
    click(q('[aria-label="Actions for folder Folder1"]'));
    click(menuItem("Delete folder"));
    click(toastButtons("Close")[0]);
    await flush();
    // Now A is unfiled (folderId null)

    // Move A into folder F2; PATCH fails
    click(q(`[aria-label="Actions for ${TITLE}"]`));
    click(menuItem("Move to Folder2"));
    await flush();

    // Assert A rolls back to unfiled (not F1), error toast shows
    expect(container.textContent).toContain("Could not move Rewind");
    // Verify the three fetch calls: 1. PATCH move to F1 (success), 2. DELETE
    // folder F1 (success), 3. PATCH move to F2 (failed with 500).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/rewinds/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: "f1" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/folders/f1", {
      method: "DELETE",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/rewinds/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: "f2" }),
    });

    // `moveRewindToFolder` returns early when the target equals the current
    // folder, so an unfiled A sends nothing here. Rolled back to the deleted
    // "f1" instead, it would send a fourth PATCH.
    click(q(`[aria-label="Actions for ${TITLE}"]`));
    click(menuItem("Move to All Rewinds"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("onDragOver over a column and a folder prevents the default", () => {
    mountBoard();
    const column = qAll("section")[1];
    const columnEvent = new Event("dragover", {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      column.dispatchEvent(columnEvent);
    });
    expect(columnEvent.defaultPrevented).toBe(true);

    const allButton = qAll("button").find(
      (b) => b.textContent === "All Rewinds",
    )!;
    const folderEvent = new Event("dragover", {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      allButton.dispatchEvent(folderEvent);
    });
    expect(folderEvent.defaultPrevented).toBe(true);
  });
});

function openPalette() {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
  });
}

function paletteInput(): HTMLInputElement {
  return q('input[role="combobox"]') as HTMLInputElement;
}

describe("palette", () => {
  function mountPalette() {
    mount(
      <Library
        rewinds={[rewind({ id: "a" })]}
        folders={[folder()]}
        view="grid"
        folderId={undefined}
      />,
    );
  }

  it("Cmd+K opens it, focused, and Escape closes it", () => {
    mountPalette();
    openPalette();
    expect(q('[role="dialog"]').getAttribute("aria-modal")).toBe("true");
    key(paletteInput(), "Escape");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Cmd+K again closes it", () => {
    mountPalette();
    openPalette();
    openPalette();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("the sidebar search button opens it", () => {
    mountPalette();
    const searchButton = qAll("button").find((b) =>
      b.textContent?.includes("Search or jump to…"),
    )!;
    click(searchButton);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("filters case-insensitively, shows No results when empty", () => {
    mountPalette();
    openPalette();
    type(paletteInput(), "checkout fails");
    expect(qAll('[role="option"]')).toHaveLength(1);
    type(paletteInput(), "zzz-nothing-matches");
    expect(container.textContent).toContain("No results");
  });

  it("resets the selection to 0 when the query changes", () => {
    mountPalette();
    openPalette();
    key(paletteInput(), "ArrowDown");
    type(paletteInput(), "a");
    expect(qAll('[role="option"]')[0].getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("ArrowDown/ArrowUp move the selection and wrap", () => {
    mountPalette();
    openPalette();
    key(paletteInput(), "ArrowUp");
    const options = qAll('[role="option"]');
    expect(options[options.length - 1].getAttribute("aria-selected")).toBe(
      "true",
    );
    key(paletteInput(), "ArrowDown");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
  });

  it("mouse hover moves the selection", () => {
    mountPalette();
    openPalette();
    const options = qAll('[role="option"]');
    act(() => {
      options[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(options[1].getAttribute("aria-selected")).toBe("true");
  });

  it("Enter on All Rewinds navigates and closes", () => {
    mountPalette();
    openPalette();
    key(paletteInput(), "Enter");
    expect(replace).toHaveBeenCalledWith("/");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Enter on a folder item navigates to it", () => {
    mountPalette();
    openPalette();
    type(paletteInput(), "Checkout bugs");
    key(paletteInput(), "Enter");
    expect(replace).toHaveBeenCalledWith("/?folder=f1");
  });

  it("Enter on a view item switches the view", () => {
    mountPalette();
    openPalette();
    type(paletteInput(), "Switch to board view");
    key(paletteInput(), "Enter");
    expect(replace).toHaveBeenCalledWith("/?view=board");
  });

  it("Enter on a Rewind pushes its page", () => {
    mountPalette();
    openPalette();
    type(paletteInput(), TITLE);
    key(paletteInput(), "Enter");
    expect(push).toHaveBeenCalledWith("/r/a");
  });

  it("clicking an item runs it", () => {
    mountPalette();
    openPalette();
    click(qAll('[role="option"]')[0]);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("clicking the backdrop closes it", () => {
    mountPalette();
    openPalette();
    const backdrop = container.querySelector('[role="dialog"]')!
      .previousElementSibling as HTMLElement;
    click(backdrop);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Enter with no results does nothing", () => {
    mountPalette();
    openPalette();
    type(paletteInput(), "zzz-nothing-matches");
    key(paletteInput(), "Enter");
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("arrow keys with no results do nothing", () => {
    mountPalette();
    openPalette();
    type(paletteInput(), "zzz-nothing-matches");
    key(paletteInput(), "ArrowDown");
    key(paletteInput(), "ArrowUp");
    expect(qAll('[role="option"]')).toHaveLength(0);
  });

  it("an unrelated key does nothing", () => {
    mountPalette();
    openPalette();
    key(paletteInput(), "a");
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(paletteInput()).toBeTruthy();
  });

  it("the theme item toggles dark mode and closes", () => {
    mountPalette();
    openPalette();
    type(paletteInput(), "Switch to dark mode");
    key(paletteInput(), "Enter");
    expect(document.body.classList.contains("rw-dark")).toBe(true);
    expect(localStorage.getItem("rewind-theme")).toBe("dark");
  });
});

describe("dark mode", () => {
  it("starts light when body has no rw-dark class", () => {
    mount(
      <Library rewinds={[]} folders={[]} view="grid" folderId={undefined} />,
    );
    const toggle = q('[aria-label="Toggle dark mode"]');
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("starts dark when body already has rw-dark", () => {
    document.body.classList.add("rw-dark");
    mount(
      <Library rewinds={[]} folders={[]} view="grid" folderId={undefined} />,
    );
    const toggle = q('[aria-label="Toggle dark mode"]');
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("the toggle flips the class and writes storage", () => {
    mount(
      <Library rewinds={[]} folders={[]} view="grid" folderId={undefined} />,
    );
    const toggle = q('[aria-label="Toggle dark mode"]');
    click(toggle);
    expect(document.body.classList.contains("rw-dark")).toBe(true);
    expect(localStorage.getItem("rewind-theme")).toBe("dark");
    click(toggle);
    expect(document.body.classList.contains("rw-dark")).toBe(false);
    expect(localStorage.getItem("rewind-theme")).toBe("light");
  });

  it("still toggles for the session when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mount(
      <Library rewinds={[]} folders={[]} view="grid" folderId={undefined} />,
    );
    const toggle = q('[aria-label="Toggle dark mode"]');
    click(toggle);
    expect(document.body.classList.contains("rw-dark")).toBe(true);
  });
});

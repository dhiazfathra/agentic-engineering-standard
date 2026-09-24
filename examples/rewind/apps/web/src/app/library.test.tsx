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

// @vitest-environment happy-dom
// Separate file: `flags` is a module-level const, so the HELPDESK flag can
// only be toggled with a per-file mock, not per-test.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RewindListItem } from "@/lib/rewinds";

vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return { flags: { ...actual.flags, HELPDESK: true } };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push, refresh: () => {} }),
}));

const { Library } = await import("./library");

function rewind(): RewindListItem {
  return {
    id: "r1",
    title: "Checkout fails",
    url: "https://shop.acme.co/cart",
    reporterName: "Maya Chen",
    status: "new",
    kind: "video",
    mediaKey: "rewinds/r1.webm",
    durationSeconds: 42,
    folderId: null,
    recordingLinkId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    errorCount: 0,
  } as RewindListItem;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))),
  );
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

function q(selector: string): HTMLElement {
  const el = container.querySelector(selector);
  if (!el) throw new Error(`not found: ${selector}`);
  return el as HTMLElement;
}

it("shows the Helpdesk nav link when the flag is on", () => {
  act(() => {
    root.render(
      <Library
        rewinds={[rewind()]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
  });
  expect(q('a[href="/helpdesk"]').textContent).toBe("Helpdesk");
});

it("navigates to Helpdesk from the command palette", () => {
  act(() => {
    root.render(
      <Library
        rewinds={[rewind()]}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
  });
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
  });
  const input = q('input[role="combobox"]') as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "Go to Helpdesk");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(push).toHaveBeenCalledWith("/helpdesk");
});

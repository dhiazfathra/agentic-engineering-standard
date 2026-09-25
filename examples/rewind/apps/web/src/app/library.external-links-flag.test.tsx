// @vitest-environment happy-dom
// Separate file: `flags` is a module-level const, so the EXTERNAL_LINKS
// flag can only be toggled with a per-file mock, not per-test.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RewindListItem } from "@/lib/rewinds";

vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return { flags: { ...actual.flags, EXTERNAL_LINKS: true } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
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

it("shows Docs and Contact support links in the Help popover", () => {
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
    q('[aria-label="Help"]').dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });
  expect(q('a[href="https://rewind.dev/docs"]').textContent).toBe("Docs");
  expect(q('a[href="mailto:support@rewind.dev"]').textContent).toBe(
    "Contact support",
  );
});

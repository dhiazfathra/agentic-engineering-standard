// @vitest-environment happy-dom
// Separate file: `flags` is a module-level const, so INTEGRATIONS, BILLING
// and SUPPORT_WIDGET can only be toggled with a per-file mock, not per-test.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RewindListItem } from "@/lib/rewinds";

vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return {
    flags: {
      ...actual.flags,
      INTEGRATIONS: true,
      BILLING: true,
      SUPPORT_WIDGET: true,
    },
  };
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function render(rewinds: RewindListItem[] = [rewind()]) {
  act(() => {
    root.render(
      <Library
        rewinds={rewinds}
        folders={[]}
        view="grid"
        folderId={undefined}
      />,
    );
  });
}

function runPaletteCommand(label: string) {
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
    setter.call(input, label);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

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
    vi.fn(() => Promise.resolve(new Response("[]", { status: 200 }))),
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

it("navigates to Settings, Members, Billing and Integrations from the palette", () => {
  render();
  runPaletteCommand("Go to Settings");
  expect(push).toHaveBeenCalledWith("/settings/general");

  runPaletteCommand("Go to Members");
  expect(push).toHaveBeenCalledWith("/settings/members");

  runPaletteCommand("Go to Billing");
  expect(push).toHaveBeenCalledWith("/settings/billing");

  runPaletteCommand("Go to Integrations");
  expect(push).toHaveBeenCalledWith("/settings/integrations");

  runPaletteCommand("See pricing");
  expect(push).toHaveBeenCalledWith("/settings/billing");
});

it("checks the integration-connected Get-started item once the checklist opens", async () => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      new Response(
        url === "/api/integrations" ? JSON.stringify(["Linear"]) : "[]",
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render();
  click(q('[class*="getStartedButton"]'));
  await flush();
  expect(fetchMock).toHaveBeenCalledWith("/api/integrations");
  const item = qAll('[class*="getStartedCheck"]').find((b) =>
    b.textContent?.includes("Connect an integration"),
  )!;
  expect(item.className).toContain("getStartedDone");
});

it("ignores the integration fetch if the checklist closes before it resolves", async () => {
  let resolveFetch!: (res: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ),
  );
  render();
  click(q('[class*="getStartedButton"]'));
  await flush();
  click(q('[class*="getStartedButton"]')); // close before fetch resolves
  await act(async () => {
    resolveFetch(new Response(JSON.stringify(["Linear"])));
    await Promise.resolve();
    await Promise.resolve();
  });
  // No crash and nothing to assert on state directly; the checklist is
  // closed so the button set below is not present, which is the point.
  expect(container.querySelector('[class*="getStartedList"]')).toBeFalsy();
});

it("swallows integration and invites fetch failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
  render();
  click(q('[class*="getStartedButton"]'));
  await flush();
  // No crash is the assertion; the checklist should still be open.
  expect(q('[class*="getStartedList"]')).toBeTruthy();
});

it("navigates to Settings > Integrations from an unfinished integration check", async () => {
  render();
  click(q('[class*="getStartedButton"]'));
  await flush();
  const item = qAll('[class*="getStartedCheck"]').find((b) =>
    b.textContent?.includes("Connect an integration"),
  )!;
  click(item);
  expect(push).toHaveBeenCalledWith("/settings/integrations");
});

it("shows the SUPPORT_WIDGET items in the Help popover and opens the widget", () => {
  render();
  click(q('[aria-label="Help"]'));
  const report = qAll("button").find(
    (b) => b.textContent === "Report an issue",
  )!;
  click(report);
  expect(q('[role="dialog"]')).toBeTruthy();
});

it("opens the widget on System status", () => {
  render();
  click(q('[aria-label="Help"]'));
  const status = qAll("button").find(
    (b) => b.textContent === "System status",
  )!;
  click(status);
  expect(container.textContent).toContain("All systems operational");
});

it("opens the widget on Contact support", () => {
  render();
  click(q('[aria-label="Help"]'));
  const contact = qAll("button").find(
    (b) => b.textContent === "Contact support",
  )!;
  click(contact);
  expect(q('[role="dialog"]')).toBeTruthy();
});

it("closes the widget", () => {
  render();
  click(q('[aria-label="Help"]'));
  click(qAll("button").find((b) => b.textContent === "System status")!);
  click(q('button[aria-label="Close support"]'));
  expect(container.querySelector('[role="dialog"]')).toBeFalsy();
});

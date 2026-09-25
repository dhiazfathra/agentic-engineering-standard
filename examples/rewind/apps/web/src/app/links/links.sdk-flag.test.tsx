// @vitest-environment happy-dom
// Separate file: `flags` is a module-level const, so the SDK flag can only
// be toggled with a per-file mock, not per-test.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RecordingLinkListItem } from "@/lib/rewinds";

vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return { flags: { ...actual.flags, SDK: true } };
});

const { LinksPage } = await import("./links");

function link(): RecordingLinkListItem {
  return {
    id: "l1",
    workspaceId: "w1",
    name: "Beta testers",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    rewindCount: 14,
  } as RecordingLinkListItem;
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
  localStorage.clear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

it("shows the domain button when the SDK flag is on", () => {
  act(() => {
    root.render(<LinksPage links={[link()]} userId="u1" />);
  });
  expect(
    container.querySelector('[aria-label="Connect your domain"]'),
  ).toBeTruthy();
});

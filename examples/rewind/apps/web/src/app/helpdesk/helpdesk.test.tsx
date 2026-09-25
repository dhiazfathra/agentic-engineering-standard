// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HelpdeskPage } from "./helpdesk";

let container: HTMLDivElement;
let root: Root;

function mount(el: React.ReactElement) {
  act(() => {
    root.render(el);
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

it("shows the headline and a back link", () => {
  mount(<HelpdeskPage />);
  expect(container.textContent).toContain(
    "Resolve customer issues without back and forth",
  );
  expect(container.querySelector('a[href="/"]')).toBeTruthy();
});

it("toasts on Install for Intercom", () => {
  mount(<HelpdeskPage />);
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Install for Intercom"),
  )!;
  click(button);
  expect(container.textContent).toContain("Intercom tab");
});

it("toasts on Other helpdesks", () => {
  mount(<HelpdeskPage />);
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Other helpdesks"),
  )!;
  click(button);
  expect(container.textContent).toContain("Other helpdesks");
});

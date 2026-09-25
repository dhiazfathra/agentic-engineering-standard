// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const { default: LoginPage } = await import("./page");

let container: HTMLDivElement;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

it("renders the login form", () => {
  const root = createRoot(container);
  act(() => {
    root.render(<LoginPage />);
  });
  expect(container.textContent).toContain("Log in to Rewind");
  act(() => {
    root.unmount();
  });
});

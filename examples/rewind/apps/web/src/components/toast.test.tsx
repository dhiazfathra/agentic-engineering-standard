// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast, ToastStack } from "./toast";

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

function Harness({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useToast>) => void;
}) {
  const api = useToast();
  onReady(api);
  return (
    <ToastStack toasts={api.toasts} onUndo={api.undo} onClose={api.close} />
  );
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
  vi.useRealTimers();
});

describe("plain toasts", () => {
  it("clears after 3s", () => {
    vi.useFakeTimers();
    let api!: ReturnType<typeof useToast>;
    mount(<Harness onReady={(a) => (api = a)} />);
    act(() => {
      api.showToast("Link copied");
    });
    expect(container.textContent).toContain("Link copied");
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(container.textContent).toContain("Link copied");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.textContent).not.toContain("Link copied");
  });

  it("renders the error tone", () => {
    let api!: ReturnType<typeof useToast>;
    mount(<Harness onReady={(a) => (api = a)} />);
    act(() => {
      api.showToast("Could not copy link", "error");
    });
    expect(q('[role="status"]').className).toContain("error");
  });
});

describe("action toasts", () => {
  it("stays after 60s of fake time", () => {
    vi.useFakeTimers();
    let api!: ReturnType<typeof useToast>;
    mount(<Harness onReady={(a) => (api = a)} />);
    act(() => {
      api.showActionToast("Rewind deleted", {
        onUndo: vi.fn(),
        onClose: vi.fn(),
      });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(container.textContent).toContain("Rewind deleted");
  });

  it("calls onClose and removes the toast on ×", () => {
    let api!: ReturnType<typeof useToast>;
    const onClose = vi.fn();
    mount(<Harness onReady={(a) => (api = a)} />);
    act(() => {
      api.showActionToast("Rewind deleted", { onUndo: vi.fn(), onClose });
    });
    click(q('[aria-label="Close"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Rewind deleted");
  });

  it("calls onUndo and removes the toast on Undo", () => {
    let api!: ReturnType<typeof useToast>;
    const onUndo = vi.fn();
    mount(<Harness onReady={(a) => (api = a)} />);
    act(() => {
      api.showActionToast("Rewind deleted", { onUndo, onClose: vi.fn() });
    });
    click(qAll("button").find((b) => b.textContent === "Undo")!);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Rewind deleted");
  });

  it("stacks two action toasts and closes each independently", () => {
    let api!: ReturnType<typeof useToast>;
    const closeA = vi.fn();
    const closeB = vi.fn();
    mount(<Harness onReady={(a) => (api = a)} />);
    act(() => {
      api.showActionToast("Rewind A deleted", {
        onUndo: vi.fn(),
        onClose: closeA,
      });
      api.showActionToast("Rewind B deleted", {
        onUndo: vi.fn(),
        onClose: closeB,
      });
    });
    expect(container.textContent).toContain("Rewind A deleted");
    expect(container.textContent).toContain("Rewind B deleted");
    const closeButtons = qAll('[aria-label="Close"]');
    click(closeButtons[0]!);
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Rewind A deleted");
    expect(container.textContent).toContain("Rewind B deleted");
  });
});

it("renders nothing with no toasts", () => {
  mount(<Harness onReady={() => {}} />);
  expect(container.innerHTML).toBe("");
});

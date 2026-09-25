// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportWidget } from "./support-widget";

let container: HTMLDivElement;
let root: Root;

function mount(el: React.ReactElement) {
  act(() => {
    root.render(el);
  });
}

function q(selector: string): HTMLElement | null {
  return container.querySelector(selector);
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

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
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
  vi.unstubAllGlobals();
});

describe("SupportWidget", () => {
  it("shows the home screen with Messages and System status", () => {
    mount(<SupportWidget initialView="home" onClose={vi.fn()} />);
    expect(container.textContent).toContain("Messages");
    expect(container.textContent).toContain("System status");
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    mount(<SupportWidget initialView="home" onClose={onClose} />);
    click(q('button[aria-label="Close support"]')!);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the operational status line", () => {
    mount(<SupportWidget initialView="status" onClose={vi.fn()} />);
    expect(container.textContent).toContain("All systems operational");
  });

  it("navigates from home to Messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]")));
    mount(<SupportWidget initialView="home" onClose={vi.fn()} />);
    const messagesBtn = Array.from(
      container.querySelectorAll("button"),
    ).find((b) => b.textContent === "Messages ›")!;
    click(messagesBtn);
    await flush();
    expect(container.querySelector('input[aria-label="Message"]')).toBeTruthy();
  });

  it("navigates from home to System status", () => {
    mount(<SupportWidget initialView="home" onClose={vi.fn()} />);
    const statusBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "System status ›",
    )!;
    click(statusBtn);
    expect(container.textContent).toContain("All systems operational");
  });

  it("goes back to home from a sub-screen", () => {
    mount(<SupportWidget initialView="status" onClose={vi.fn()} />);
    click(q('button[aria-label="Back"]')!);
    expect(container.textContent).toContain("Messages");
  });

  it("loads and shows past messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([{ id: "m1", text: "hi", reply: "Thanks!" }]),
        ),
      ),
    );
    mount(<SupportWidget initialView="messages" onClose={vi.fn()} />);
    await flush();
    expect(container.textContent).toContain("hi");
    expect(container.textContent).toContain("Thanks!");
  });

  it("shows no messages when the load request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    mount(<SupportWidget initialView="messages" onClose={vi.fn()} />);
    await flush();
    expect(container.querySelector('[class*="message"]')).toBeFalsy();
  });

  it("shows no messages when the load request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    mount(<SupportWidget initialView="messages" onClose={vi.fn()} />);
    await flush();
    expect(container.querySelector('[class*="message"]')).toBeFalsy();
  });

  it("sends a message and appends the reply", async () => {
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: "m2", text: "help", reply: "We got it" }),
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([])));
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SupportWidget initialView="messages" onClose={vi.fn()} />);
    await flush();
    setValue(q('input[aria-label="Message"]') as HTMLInputElement, "help");
    const sendBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Send",
    )!;
    click(sendBtn);
    await flush();
    expect(container.textContent).toContain("help");
    expect(container.textContent).toContain("We got it");
  });

  it("does not send an empty message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]")));
    mount(<SupportWidget initialView="messages" onClose={vi.fn()} />);
    await flush();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    const sendBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Send",
    )!;
    click(sendBtn);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends on Enter key", async () => {
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ id: "m3", text: "enter-sent" })),
        );
      }
      return Promise.resolve(new Response("[]"));
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(<SupportWidget initialView="messages" onClose={vi.fn()} />);
    await flush();
    const input = q('input[aria-label="Message"]') as HTMLInputElement;
    setValue(input, "enter-sent");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await flush();
    expect(container.textContent).toContain("enter-sent");
  });

  it("ignores the messages fetch if unmounted before it resolves", async () => {
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
    mount(<SupportWidget initialView="messages" onClose={vi.fn()} />);
    act(() => {
      root.unmount();
    });
    await act(async () => {
      resolveFetch(new Response(JSON.stringify([{ id: "m1", text: "hi" }])));
      await Promise.resolve();
      await Promise.resolve();
    });
    // No crash after unmount is the assertion.
    expect(container.textContent).toBe("");
  });

  it("keeps the draft when sending fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url, opts) =>
        Promise.resolve(
          new Response("[]", { status: opts?.method === "POST" ? 500 : 200 }),
        ),
      ),
    );
    mount(<SupportWidget initialView="messages" onClose={vi.fn()} />);
    await flush();
    const input = q('input[aria-label="Message"]') as HTMLInputElement;
    setValue(input, "still here");
    const sendBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Send",
    )!;
    click(sendBtn);
    await flush();
    expect(input.value).toBe("still here");
  });
});

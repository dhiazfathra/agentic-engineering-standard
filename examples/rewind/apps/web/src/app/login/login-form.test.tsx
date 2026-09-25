// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const { LoginForm } = await import("./login-form");

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<LoginForm />);
  });
}

function q(selector: string): HTMLElement {
  const el = container.querySelector(selector);
  if (!el) throw new Error(`not found: ${selector}`);
  return el as HTMLElement;
}

function qOptional(selector: string): HTMLElement | null {
  return container.querySelector(selector);
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

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function submit() {
  act(() => {
    q("form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  push.mockReset();
  document.cookie = "rw_last_email=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders the full form on the server, before the cookie can be read", () => {
  const html = renderToStaticMarkup(<LoginForm />);
  expect(html).toContain("Log in to Rewind");
});

describe("no remembered email", () => {
  it("renders the login form by default", () => {
    mount();
    expect(q("#login-email")).toBeTruthy();
    expect(q("#login-password")).toBeTruthy();
    expect(qOptional("#login-first-name")).toBeNull();
    expect(container.textContent).toContain("Log in to Rewind");
  });

  it("toggles to create-account mode and back", () => {
    mount();
    click(q('button[type="button"]'));
    expect(q("#login-first-name")).toBeTruthy();
    expect(q("#login-last-name")).toBeTruthy();
    expect(container.textContent).toContain("Create an account");

    click(q('button[type="button"]'));
    expect(qOptional("#login-first-name")).toBeNull();
  });

  it("submits login credentials and redirects on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    type(q("#login-email") as HTMLInputElement, "a@example.com");
    type(q("#login-password") as HTMLInputElement, "hunter2");
    submit();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@example.com", password: "hunter2" }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  it("submits signup credentials with names", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    click(q('button[type="button"]'));
    type(q("#login-email") as HTMLInputElement, "a@example.com");
    type(q("#login-first-name") as HTMLInputElement, "A");
    type(q("#login-last-name") as HTMLInputElement, "B");
    type(q("#login-password") as HTMLInputElement, "hunter22");
    submit();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/signup",
      expect.objectContaining({
        body: JSON.stringify({
          email: "a@example.com",
          password: "hunter22",
          firstName: "A",
          lastName: "B",
        }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows the pending state while the request is in flight", async () => {
    let resolveFetch: (r: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount();
    type(q("#login-password") as HTMLInputElement, "hunter2");
    submit();
    await flush();
    const button = q('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("…");
    await act(async () => {
      resolveFetch(jsonResponse({}));
      await Promise.resolve();
    });
  });

  it("shows field errors from a 400 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            fieldErrors: { email: ["Invalid email"], password: [] },
          },
        },
        400,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount();
    type(q("#login-password") as HTMLInputElement, "hunter2");
    submit();
    await flush();
    expect(container.textContent).toContain("Invalid email");
    const button = q('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("shows a password field error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { fieldErrors: { password: ["Too short"] } } },
        400,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount();
    type(q("#login-password") as HTMLInputElement, "x");
    submit();
    await flush();
    expect(container.textContent).toContain("Too short");
  });

  it("shows a generic error when the response body is not JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("not json", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    type(q("#login-password") as HTMLInputElement, "hunter2");
    submit();
    await flush();
    expect(container.textContent).toContain("Something went wrong.");
  });

  it("shows a form-level error string from a 401 response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Invalid credentials" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    type(q("#login-password") as HTMLInputElement, "hunter2");
    submit();
    await flush();
    expect(container.textContent).toContain("Invalid credentials");
  });

  it("shows a generic error when the response body has no usable error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    type(q("#login-password") as HTMLInputElement, "hunter2");
    submit();
    await flush();
    expect(container.textContent).toContain("Something went wrong.");
  });

  it("shows field errors for first and last name in signup mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            fieldErrors: {
              firstName: ["Required"],
              lastName: ["Required"],
            },
          },
        },
        400,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount();
    click(q('button[type="button"]'));
    type(q("#login-email") as HTMLInputElement, "a@example.com");
    type(q("#login-password") as HTMLInputElement, "hunter22");
    submit();
    await flush();
    expect(container.textContent.match(/Required/g)?.length).toBe(2);
  });

  it("treats a blank remembered-email cookie as absent", () => {
    document.cookie = "rw_last_email=; path=/";
    mount();
    expect(q("#login-email")).toBeTruthy();
  });

  it("shows a generic error when the request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    mount();
    type(q("#login-password") as HTMLInputElement, "hunter2");
    submit();
    await flush();
    expect(container.textContent).toContain("Something went wrong.");
  });
});

describe("remembered email", () => {
  beforeEach(() => {
    document.cookie = "rw_last_email=a%40example.com; path=/";
  });

  it("shows a continue-as button instead of the full form", () => {
    mount();
    expect(container.textContent).toContain("Welcome back");
    expect(container.textContent).toContain(
      "Continue as a@example.com",
    );
    expect(qOptional("#login-email")).toBeNull();
    expect(q("#login-password")).toBeTruthy();
  });

  it("submits with the remembered email and redirects on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    type(q("#login-password") as HTMLInputElement, "hunter2");
    submit();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        body: JSON.stringify({
          email: "a@example.com",
          password: "hunter2",
        }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  it("switches to the full form when 'not you' is clicked", () => {
    mount();
    click(q('button[type="button"]'));
    expect(qOptional("#login-email")).toBeTruthy();
    expect(container.textContent).toContain("Log in to Rewind");
  });
});

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import capture from "../entrypoints/capture-main.content";
import {
  installConsole,
  installErrors,
  installHistory,
  installNetwork,
  makeSend,
} from "../entrypoints/capture-main.content";
import type { CapturedEvent } from "../lib/messages";

function collect(): {
  events: CapturedEvent[];
  send: (e: CapturedEvent) => void;
} {
  const events: CapturedEvent[] = [];
  return { events, send: (e) => events.push(e) };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("installConsole", () => {
  it("reports log/info/debug as log, warn as warn, error as err", () => {
    const { events, send } = collect();
    const original = { ...window.console };
    installConsole(window, send);
    window.console.log("a", "b");
    window.console.info("c");
    window.console.debug("d");
    window.console.warn("e");
    window.console.error("f");
    expect(events.map((e) => [e.kind, e.text, e.isError])).toEqual([
      ["log", "a b", false],
      ["log", "c", false],
      ["log", "d", false],
      ["warn", "e", false],
      ["err", "f", true],
    ]);
    Object.assign(window.console, original);
  });

  it("still calls the original console method", () => {
    const { send } = collect();
    const original = vi.spyOn(console, "log");
    installConsole(window, send);
    window.console.log("hello");
    expect(original).toHaveBeenCalledWith("hello");
  });

  it("never throws into the page when send throws", () => {
    installConsole(window, () => {
      throw new Error("boom");
    });
    expect(() => window.console.log("x")).not.toThrow();
  });
});

describe("installErrors", () => {
  it("reports a window error as err", () => {
    const { events, send } = collect();
    installErrors(window, send);
    window.dispatchEvent(
      Object.assign(new Event("error"), {
        error: new Error("bad"),
        message: "bad",
      }),
    );
    expect(events).toEqual([
      { at: expect.any(Number), kind: "err", text: "bad", isError: true },
    ]);
  });

  it("falls back to the event's message when there is no Error object", () => {
    const { events, send } = collect();
    installErrors(window, send);
    window.dispatchEvent(
      Object.assign(new Event("error"), { message: "plain" }),
    );
    expect(events[0]!.text).toBe("plain");
  });

  it("reports an unhandled rejection with an Error reason", () => {
    const { events, send } = collect();
    installErrors(window, send);
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("rej"),
      }),
    );
    expect(events[0]).toMatchObject({
      kind: "err",
      text: "rej",
      isError: true,
    });
  });

  it("formats a non-Error rejection reason", () => {
    const { events, send } = collect();
    installErrors(window, send);
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: { code: 1 } }),
    );
    expect(events[0]!.text).toBe('{"code":1}');
  });

  it("never throws into the page when send throws", () => {
    installErrors(window, () => {
      throw new Error("boom");
    });
    expect(() =>
      window.dispatchEvent(Object.assign(new Event("error"), { message: "x" })),
    ).not.toThrow();
    expect(() =>
      window.dispatchEvent(
        Object.assign(new Event("unhandledrejection"), { reason: "x" }),
      ),
    ).not.toThrow();
  });
});

describe("installHistory", () => {
  it("reports pushState and replaceState as nav", () => {
    const { events, send } = collect();
    installHistory(window, send);
    window.history.pushState({}, "", "/a");
    window.history.replaceState({}, "", "/b");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "nav" });
  });

  it("preserves pushState's return value", () => {
    const { send } = collect();
    installHistory(window, send);
    expect(window.history.pushState({}, "", "/c")).toBeUndefined();
  });

  it("reports popstate as nav", () => {
    const { events, send } = collect();
    installHistory(window, send);
    window.dispatchEvent(new Event("popstate"));
    expect(events).toHaveLength(1);
  });

  it("never throws into the page when send throws", () => {
    installHistory(window, () => {
      throw new Error("boom");
    });
    expect(() => window.history.pushState({}, "", "/z")).not.toThrow();
    expect(() => window.dispatchEvent(new Event("popstate"))).not.toThrow();
  });
});

describe("installNetwork", () => {
  it("reports a successful fetch, resolving relative URLs against the page", async () => {
    const { events, send } = collect();
    window.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    installNetwork(window, send);
    await window.fetch("/api/cart");
    expect(events[0]).toMatchObject({ kind: "net", isError: false });
    expect(events[0]!.text).toContain("GET");
  });

  it("accepts a URL object as the fetch input", async () => {
    const { events, send } = collect();
    window.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    installNetwork(window, send);
    await window.fetch(new URL("/api/cart", window.location.href));
    expect(events[0]).toMatchObject({ kind: "net", isError: false });
  });

  it("marks a >=400 status as an error", async () => {
    const { events, send } = collect();
    window.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    installNetwork(window, send);
    await window.fetch(new Request("https://a.co/x", { method: "POST" }));
    expect(events[0]!.isError).toBe(true);
  });

  it("reports and rethrows a failed fetch", async () => {
    const { events, send } = collect();
    window.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    installNetwork(window, send);
    await expect(window.fetch("/x")).rejects.toThrow("network down");
    expect(events[0]).toMatchObject({ kind: "net", isError: true });
  });

  it("never throws into the page when send throws on a fetch response", async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    installNetwork(window, () => {
      throw new Error("boom");
    });
    await expect(window.fetch("/x")).resolves.toBeInstanceOf(Response);
  });

  it("never throws into the page when send throws on a fetch failure", async () => {
    window.fetch = vi.fn().mockRejectedValue(new Error("down"));
    installNetwork(window, () => {
      throw new Error("boom");
    });
    await expect(window.fetch("/x")).rejects.toThrow("down");
  });

  it("reports an XHR request, preserving `this` and the return value", async () => {
    const { events, send } = collect();
    installNetwork(window, send);
    const xhr = new window.XMLHttpRequest();
    const done = new Promise<void>((resolve) =>
      xhr.addEventListener("loadend", () => resolve()),
    );
    xhr.open("GET", "/api/x");
    xhr.send();
    Object.defineProperty(xhr, "status", { value: 200, configurable: true });
    xhr.dispatchEvent(new Event("loadend"));
    await done;
    expect(events[0]).toMatchObject({ kind: "net", isError: false });
  });

  it("accepts a URL object as the XHR open target", () => {
    const { events, send } = collect();
    installNetwork(window, send);
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", new URL("/api/x", window.location.href));
    xhr.send();
    Object.defineProperty(xhr, "status", { value: 200, configurable: true });
    xhr.dispatchEvent(new Event("loadend"));
    expect(events[0]).toMatchObject({ kind: "net", isError: false });
  });

  it("marks a failed XHR (status 0) as an error", async () => {
    const { events, send } = collect();
    installNetwork(window, send);
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", "/api/x");
    xhr.send();
    xhr.dispatchEvent(new Event("loadend"));
    expect(events[0]!.isError).toBe(true);
  });

  it("never throws into the page when send throws on an XHR loadend", () => {
    installNetwork(window, () => {
      throw new Error("boom");
    });
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", "/api/x");
    xhr.send();
    expect(() => xhr.dispatchEvent(new Event("loadend"))).not.toThrow();
  });
});

// Real `postMessage` delivery doesn't reliably preserve `event.source` in
// happy-dom (see the same note on `forwardMainEvent` in capture.content.ts),
// so simulating ISOLATED's reply dispatches a synthetic `message` event with
// `source: window` set explicitly, like the other content-script tests do.
function dispatchFromSelf(data: unknown): void {
  window.dispatchEvent(
    new MessageEvent("message", { data, source: window as unknown as Window }),
  );
}

describe("entrypoint", () => {
  it("wires every wrapper and posts events to the isolated world once it announces ready", async () => {
    const posted: MessageEvent[] = [];
    window.addEventListener("message", (e) => {
      posted.push(e as MessageEvent);
    });
    expect(() => (capture.main as () => void)()).not.toThrow();
    window.console.log("hello");
    dispatchFromSelf({ source: "rewind", ready: true });
    await vi.waitFor(() =>
      expect(posted.map((e) => e.data)).toContainEqual({
        source: "rewind",
        event: expect.objectContaining({ kind: "log", text: "hello" }),
      }),
    );
  });
});

describe("makeSend", () => {
  it("posts a hello handshake message on install", async () => {
    const posted: unknown[] = [];
    window.addEventListener("message", (e) => posted.push(e.data));
    makeSend(window);
    await vi.waitFor(() =>
      expect(posted).toContainEqual({ source: "rewind", hello: true }),
    );
  });

  it("queues events until isolated replies ready, then flushes in order", async () => {
    const send = makeSend(window);
    const posted: unknown[] = [];
    window.addEventListener("message", (e) => {
      const data = e.data as { event?: unknown };
      if (data?.event) posted.push(data);
    });
    send({ at: 1, kind: "log", text: "a", isError: false });
    send({ at: 2, kind: "log", text: "b", isError: false });
    expect(posted).toHaveLength(0);
    dispatchFromSelf({ source: "rewind", ready: true });
    await vi.waitFor(() =>
      expect(
        posted.map((p) => (p as { event: { text: string } }).event.text),
      ).toEqual(["a", "b"]),
    );
  });

  it("posts directly once ready, without re-queuing", async () => {
    const send = makeSend(window);
    dispatchFromSelf({ source: "rewind", ready: true });
    const posted: unknown[] = [];
    window.addEventListener("message", (e) => {
      const data = e.data as { event?: unknown };
      if (data?.event) posted.push(data);
    });
    send({ at: 1, kind: "log", text: "c", isError: false });
    await vi.waitFor(() =>
      expect(posted).toEqual([
        {
          source: "rewind",
          event: { at: 1, kind: "log", text: "c", isError: false },
        },
      ]),
    );
  });

  it("caps the queue at 1000, dropping the oldest", async () => {
    const send = makeSend(window);
    for (let i = 0; i < 1001; i++) {
      send({ at: i, kind: "log", text: String(i), isError: false });
    }
    const posted: unknown[] = [];
    window.addEventListener("message", (e) => {
      const data = e.data as { event?: { at: number } };
      if (data?.event) posted.push(data.event.at);
    });
    dispatchFromSelf({ source: "rewind", ready: true });
    await vi.waitFor(() => expect(posted).toHaveLength(1000));
    expect(posted[0]).toBe(1);
    expect(posted[posted.length - 1]).toBe(1000);
  });

  it("ignores a non-rewind or non-ready message", () => {
    const send = makeSend(window);
    dispatchFromSelf({ source: "other", ready: true });
    dispatchFromSelf({ source: "rewind", ready: false });
    const posted: unknown[] = [];
    window.addEventListener("message", (e) => {
      const data = e.data as { event?: unknown };
      if (data?.event) posted.push(data);
    });
    send({ at: 1, kind: "log", text: "x", isError: false });
    expect(posted).toHaveLength(0);
  });
});

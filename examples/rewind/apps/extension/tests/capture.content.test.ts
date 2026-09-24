// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import capture, {
  forwardMainEvent,
  maybeSendInitialNav,
  selectArea,
} from "../entrypoints/capture.content";
import { settings } from "../lib/settings";

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("maybeSendInitialNav", () => {
  it("sends when captureUserEvents is on", () => {
    const onSend = vi.fn();
    maybeSendInitialNav(true, onSend);
    expect(onSend).toHaveBeenCalled();
  });

  it("skips when captureUserEvents is off", () => {
    const onSend = vi.fn();
    maybeSendInitialNav(false, onSend);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("forwardMainEvent", () => {
  it("forwards a rewind event posted by the same window", () => {
    const onEvent = vi.fn();
    const capturedEvent = {
      at: 1,
      kind: "log" as const,
      text: "hi",
      isError: false,
    };
    forwardMainEvent(
      {
        source: window,
        data: { source: "rewind", event: capturedEvent },
      } as unknown as MessageEvent,
      window,
      onEvent,
    );
    expect(onEvent).toHaveBeenCalledWith(capturedEvent);
  });

  it("ignores a message from another window", () => {
    const onEvent = vi.fn();
    forwardMainEvent(
      {
        source: {},
        data: { source: "rewind", event: {} },
      } as unknown as MessageEvent,
      window,
      onEvent,
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores a message not tagged by the MAIN world script", () => {
    const onEvent = vi.fn();
    forwardMainEvent(
      { source: window, data: { source: "other" } } as unknown as MessageEvent,
      window,
      onEvent,
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores a rewind-sourced message with no event", () => {
    const onEvent = vi.fn();
    forwardMainEvent(
      { source: window, data: { source: "rewind" } } as unknown as MessageEvent,
      window,
      onEvent,
    );
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe("selectArea", () => {
  function drag(host: Element, from: [number, number], to: [number, number]) {
    host.dispatchEvent(
      new MouseEvent("mousedown", { clientX: from[0], clientY: from[1] }),
    );
    host.dispatchEvent(
      new MouseEvent("mousemove", { clientX: to[0], clientY: to[1] }),
    );
    host.dispatchEvent(
      new MouseEvent("mouseup", { clientX: to[0], clientY: to[1] }),
    );
  }

  it("resolves the dragged rect on mouseup and removes the overlay", async () => {
    const promise = selectArea(document);
    const host = document.documentElement.lastElementChild!;
    drag(host, [10, 10], [50, 60]);
    const rect = await promise;
    expect(rect).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 50,
      viewportWidth: window.innerWidth,
    });
    expect(document.documentElement.contains(host)).toBe(false);
  });

  it("ignores a mousemove before mousedown", async () => {
    const promise = selectArea(document);
    const host = document.documentElement.lastElementChild!;
    host.dispatchEvent(new MouseEvent("mousemove", { clientX: 5, clientY: 5 }));
    drag(host, [0, 0], [30, 30]);
    expect(await promise).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 30,
      viewportWidth: window.innerWidth,
    });
  });

  it("treats a rect smaller than 10px either side as cancel", async () => {
    const promise = selectArea(document);
    const host = document.documentElement.lastElementChild!;
    drag(host, [0, 0], [5, 5]);
    expect(await promise).toBeNull();
  });

  it("cancels on Escape", async () => {
    const promise = selectArea(document);
    const host = document.documentElement.lastElementChild!;
    host.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(await promise).toBeNull();
  });

  it("confirms the current rect on Enter", async () => {
    const promise = selectArea(document);
    const host = document.documentElement.lastElementChild!;
    host.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0 }));
    host.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 40, clientY: 40 }),
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(await promise).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      viewportWidth: window.innerWidth,
    });
  });

  it("ignores other keys", async () => {
    const promise = selectArea(document);
    const host = document.documentElement.lastElementChild!;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    drag(host, [0, 0], [30, 30]);
    expect(await promise).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 30,
      viewportWidth: window.innerWidth,
    });
  });
});

// One shared content-script instance: `main()` attaches document/window
// listeners that persist for the file's happy-dom instance, so registering it
// more than once would double-count every click and change.
describe("entrypoint", () => {
  it("sends the initial nav, forwards MAIN events, gates user events on the setting, and answers select-area", async () => {
    await settings.setValue({
      ...(await settings.getValue()),
      captureUserEvents: true,
    });
    const sendSpy = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue(undefined);

    capture.main({} as never);

    await vi.waitFor(() =>
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "event",
          event: expect.objectContaining({ kind: "nav" }),
        }),
      ),
    );

    sendSpy.mockClear();
    const capturedEvent = {
      at: 1,
      kind: "log" as const,
      text: "hi",
      isError: false,
    };
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "rewind", event: capturedEvent },
        source: window,
      } as MessageEventInit),
    );
    expect(sendSpy).toHaveBeenCalledWith({
      type: "event",
      event: capturedEvent,
    });

    sendSpy.mockClear();
    const button = document.createElement("button");
    button.textContent = "Save";
    document.body.appendChild(button);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ kind: "click" }),
      }),
    );

    sendSpy.mockClear();
    const div = document.createElement("div");
    document.body.appendChild(div);
    div.dispatchEvent(new Event("change", { bubbles: true }));
    expect(sendSpy).not.toHaveBeenCalled();

    sendSpy.mockClear();
    const input = document.createElement("input");
    input.name = "email";
    document.body.appendChild(input);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ kind: "input" }),
      }),
    );

    // Toggle the setting off: clicks and changes stop being reported.
    sendSpy.mockClear();
    await settings.setValue({
      ...(await settings.getValue()),
      captureUserEvents: false,
    });
    await vi.waitFor(() => {
      const btn = document.createElement("button");
      document.body.appendChild(btn);
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(sendSpy).not.toHaveBeenCalled();
    });
    const offInput = document.createElement("input");
    offInput.name = "off";
    document.body.appendChild(offInput);
    offInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(sendSpy).not.toHaveBeenCalled();

    // Toggle back on: clicks resume.
    await settings.setValue({
      ...(await settings.getValue()),
      captureUserEvents: true,
    });
    await vi.waitFor(() => {
      const btn = document.createElement("button");
      document.body.appendChild(btn);
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ kind: "click" }),
        }),
      );
    });

    // select-area, relayed through the real onMessage listener.
    const triggerPromise = fakeBrowser.runtime.onMessage.trigger(
      { type: "select-area" },
      {},
      () => {},
    );
    await vi.waitFor(() =>
      expect(document.documentElement.lastElementChild).not.toBeNull(),
    );
    const host = document.documentElement.lastElementChild!;
    host.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const [rect] = await triggerPromise;
    expect(rect).toBeNull();

    const [other] = await fakeBrowser.runtime.onMessage.trigger(
      { type: "save-replay", tabId: 1 },
      {},
      () => {},
    );
    expect(other).toBeUndefined();
  });
});

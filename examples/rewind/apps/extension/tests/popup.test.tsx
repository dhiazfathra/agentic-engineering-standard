// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import App from "../entrypoints/popup/App";
import {
  clearSnapshots,
  deleteDraft,
  listDrafts,
  putDraft,
  type Draft,
} from "../lib/drafts";
import { settings, DEFAULTS } from "../lib/settings";

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<App />);
  });
}

async function flush() {
  await act(async () => {
    // IndexedDB (fake-indexeddb) round-trips schedule with a macrotask.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
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

function change(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  // React listens to "change" on <select> and to the bubbling "input" event
  // on <input> to implement a controlled onChange.
  const eventName = el instanceof HTMLSelectElement ? "change" : "input";
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(eventName, { bubbles: true }));
  });
}

function blur(el: HTMLElement) {
  // React implements onBlur with the (bubbling) native "focusout" event.
  act(() => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

function stubTabCapture(available: boolean) {
  if (available) {
    Object.defineProperty(browser, "tabCapture", {
      value: {
        getMediaStreamId: vi.fn().mockResolvedValue("stream-1"),
      },
      configurable: true,
    });
  } else {
    Object.defineProperty(browser, "tabCapture", {
      value: undefined,
      configurable: true,
    });
  }
}

function stubPermissions(overrides: {
  contains?: () => Promise<boolean>;
  request?: () => Promise<boolean>;
}) {
  Object.defineProperty(browser, "permissions", {
    value: {
      contains: vi.fn(overrides.contains ?? (() => Promise.resolve(true))),
      request: vi.fn(overrides.request ?? (() => Promise.resolve(true))),
    },
    configurable: true,
  });
}

function stubMediaDevices(
  devices: { deviceId: string; kind: string; label: string }[],
) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      enumerateDevices: vi.fn().mockResolvedValue(devices),
    },
    configurable: true,
  });
}

beforeEach(async () => {
  fakeBrowser.reset();
  for (const d of await listDrafts()) await deleteDraft(d.id);
  await clearSnapshots();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  document.body.className = "";
  await fakeBrowser.tabs.update(0, { url: "https://a.co/x" });
  vi.spyOn(browser.tabs, "query").mockImplementation(
    async () => [{ id: 0, url: "https://a.co/x" }] as never,
  );
  vi.spyOn(browser.tabs, "create").mockResolvedValue({} as never);
  vi.spyOn(browser.runtime, "sendMessage").mockImplementation(
    async () => undefined as never,
  );
  vi.spyOn(browser.runtime, "reload").mockImplementation(() => undefined);
  vi.spyOn(window, "close").mockImplementation(() => undefined);
  stubTabCapture(true);
  stubMediaDevices([]);
  stubPermissions({});
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("home", () => {
  it("keeps showing just the logo while no tab is active", async () => {
    vi.spyOn(browser.tabs, "query").mockImplementation(async () => [] as never);
    mount();
    await flush();
    expect(q("h1").textContent).toBe("rewind");
    expect(container.querySelector("[class*='mainAction']")).toBeNull();
  });

  it("shows the logo and hides the drafts pill with no drafts", async () => {
    mount();
    await flush();
    expect(q("h1").textContent).toBe("rewind");
    expect(container.querySelector("[class*='draftsPill']")).toBeNull();
  });

  it("shows a draft pill (singular) with one draft", async () => {
    await putDraft(draft("d1", Date.now()));
    mount();
    await flush();
    const pill = q("[class*='draftsPill']");
    expect(pill.textContent).toBe("1 draft unfinished");
  });

  it("shows a draft pill (plural) with several drafts and opens Drafts", async () => {
    await putDraft(draft("d1", Date.now()));
    await putDraft(draft("d2", Date.now()));
    mount();
    await flush();
    const pill = q("[class*='draftsPill']");
    expect(pill.textContent).toBe("2 drafts unfinished");
    click(pill);
    expect(q("[class*='viewTitle']").textContent).toBe("Drafts");
  });

  it("opens the web app in a new tab", async () => {
    mount();
    await flush();
    click(q("[aria-label='Open web app']"));
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: DEFAULTS.appUrl,
    });
  });

  it("toggles the ••• menu and opens Settings", async () => {
    mount();
    await flush();
    const menuButton = q("[aria-label='More']");
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    click(menuButton);
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
    click(q("[class*='menuItem']"));
    expect(q("[class*='viewTitle']").textContent).toBe("Settings");
  });

  it("restarts the extension from the menu", async () => {
    mount();
    await flush();
    click(q("[aria-label='More']"));
    const items = qAll("[class*='menuItem']");
    click(items[1]!);
    expect(browser.runtime.reload).toHaveBeenCalled();
  });

  it("disables capture on a non-http(s) page", async () => {
    vi.spyOn(browser.tabs, "query").mockImplementation(
      async () => [{ id: 0, url: "chrome://extensions" }] as never,
    );
    mount();
    await flush();
    expect(container.textContent).toContain("Open a web page to capture it");
    const mainActions = qAll("[class*='mainAction']");
    for (const btn of mainActions) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("shows no host access notice once permission is granted", async () => {
    mount();
    await flush();
    expect(container.textContent).not.toContain(
      "Rewind needs access to web pages to capture them",
    );
  });

  it("shows a host access notice and disables capture until granted", async () => {
    stubPermissions({ contains: () => Promise.resolve(false) });
    mount();
    await flush();
    expect(container.textContent).toContain(
      "Rewind needs access to web pages to capture them",
    );
    const mainActions = qAll("[class*='mainAction']");
    expect(mainActions.length).toBeGreaterThan(0);
    for (const btn of mainActions) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("hides the notice after the grant request succeeds", async () => {
    stubPermissions({
      contains: () => Promise.resolve(false),
      request: () => Promise.resolve(true),
    });
    mount();
    await flush();
    click(q("[class*='noticeButton']"));
    await flush();
    expect(container.textContent).not.toContain(
      "Rewind needs access to web pages to capture them",
    );
  });

  it("keeps the notice when the grant request is denied", async () => {
    stubPermissions({
      contains: () => Promise.resolve(false),
      request: () => Promise.resolve(false),
    });
    mount();
    await flush();
    click(q("[class*='noticeButton']"));
    await flush();
    expect(container.textContent).toContain(
      "Rewind needs access to web pages to capture them",
    );
  });

  it("sends a screenshot message and closes", async () => {
    mount();
    await flush();
    click(q("[class*='mainAction']"));
    await flush();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: "screenshot",
      tabId: 0,
    });
    expect(window.close).toHaveBeenCalled();
  });

  it("toggles the time delay segment and persists it", async () => {
    mount();
    await flush();
    const seg = q("[class*='segment']");
    const buttons = Array.from(seg.querySelectorAll("button"));
    const threeSec = buttons.find((b) => b.textContent === "3s")!;
    click(threeSec);
    await flush();
    expect(threeSec.getAttribute("aria-pressed")).toBe("true");
    expect(await settings.getValue()).toMatchObject({ delay: "3s" });
  });

  it("collapses the time delay segment via the chevron", async () => {
    mount();
    await flush();
    const chevron = q("[aria-label='Toggle time delay']");
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    click(chevron);
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[class*='segment']")).toBeNull();
  });

  it("shows the record label for the tab mode by default", async () => {
    mount();
    await flush();
    const mainActions = qAll("[class*='mainAction']");
    expect(mainActions[1]!.textContent).toContain("Record tab");
  });

  it("toggles the mic chip", async () => {
    mount();
    await flush();
    const chip = q("[class*='micChip']");
    expect(chip.textContent).toBe("On");
    click(chip);
    await flush();
    expect(chip.textContent).toBe("Off");
    expect(await settings.getValue()).toMatchObject({ micOn: false });
  });

  it("collapses record options via the chevron", async () => {
    mount();
    await flush();
    const chevron = q("[aria-label='Toggle record options']");
    click(chevron);
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[aria-label='Record area']")).toBeNull();
  });

  it("changes the record mode via the select", async () => {
    mount();
    await flush();
    const select = q("[aria-label='Record area']") as HTMLSelectElement;
    change(select, "area");
    await flush();
    expect(await settings.getValue()).toMatchObject({ recordMode: "area" });
    const mainActions = qAll("[class*='mainAction']");
    expect(mainActions[1]!.textContent).toContain("Record area");
  });

  it("shows a fixed Desktop value with no tabCapture, forcing desktop mode", async () => {
    stubTabCapture(false);
    mount();
    await flush();
    expect(container.querySelector("[aria-label='Record area']")).toBeNull();
    expect(container.textContent).toContain("Desktop");
    const mainActions = qAll("[class*='mainAction']");
    expect(mainActions[1]!.textContent).toContain("Record desktop");
  });

  it("lists microphones with a fallback label and updates the setting", async () => {
    stubMediaDevices([
      { deviceId: "mic-1", kind: "audioinput", label: "" },
      { deviceId: "mic-2", kind: "audioinput", label: "USB Mic" },
      { deviceId: "cam-1", kind: "videoinput", label: "Camera" },
    ]);
    mount();
    await flush();
    const micSelect = q("[aria-label='Microphone']") as HTMLSelectElement;
    const options = Array.from(micSelect.options).map((o) => o.textContent);
    expect(options).toEqual(["Default", "Microphone 1", "USB Mic"]);
    change(micSelect, "mic-2");
    await flush();
    expect(await settings.getValue()).toMatchObject({ micDeviceId: "mic-2" });
  });

  it("records the tab, requesting a stream id, then closes", async () => {
    mount();
    await flush();
    const mainActions = qAll("[class*='mainAction']");
    click(mainActions[1]!);
    await flush();
    expect(browser.tabCapture.getMediaStreamId).toHaveBeenCalledWith({
      targetTabId: 0,
    });
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: "record",
      tabId: 0,
      mode: "tab",
      streamId: "stream-1",
    });
    expect(window.close).toHaveBeenCalled();
  });

  it("shows an error instead of leaving the click silently dead when getMediaStreamId rejects", async () => {
    (
      browser.tabCapture.getMediaStreamId as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("Tab already has a capture stream"));
    mount();
    await flush();
    const mainActions = qAll("[class*='mainAction']");
    click(mainActions[1]!);
    await flush();
    expect(container.textContent).toContain("Tab already has a capture stream");
    expect(window.close).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the rejection isn't an Error", async () => {
    (
      browser.tabCapture.getMediaStreamId as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce("nope");
    mount();
    await flush();
    const mainActions = qAll("[class*='mainAction']");
    click(mainActions[1]!);
    await flush();
    expect(container.textContent).toContain("Could not start recording");
  });

  it("records the desktop without a stream id", async () => {
    stubTabCapture(false);
    mount();
    await flush();
    const mainActions = qAll("[class*='mainAction']");
    click(mainActions[1]!);
    await flush();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: "record",
      tabId: 0,
      mode: "desktop",
    });
    expect(window.close).toHaveBeenCalled();
  });

  it("hides the instant replay block when it is off", async () => {
    mount();
    await flush();
    expect(container.textContent).not.toContain("Save instant replay");
  });

  it("saves an instant replay and closes on success", async () => {
    await settings.setValue({ ...DEFAULTS, instantReplay: true });
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation(
      async () => ({}) as never,
    );
    mount();
    await flush();
    const mainActions = qAll("[class*='mainAction']");
    const replayButton = mainActions.find((b) =>
      b.textContent?.includes("Save instant replay"),
    )!;
    click(replayButton);
    await flush();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: "save-replay",
      tabId: 0,
    });
    expect(window.close).toHaveBeenCalled();
  });

  it("shows an inline error and does not close when the replay fails", async () => {
    await settings.setValue({ ...DEFAULTS, instantReplay: true });
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation(
      async () => ({ error: "No replay yet" }) as never,
    );
    mount();
    await flush();
    const mainActions = qAll("[class*='mainAction']");
    const replayButton = mainActions.find((b) =>
      b.textContent?.includes("Save instant replay"),
    )!;
    click(replayButton);
    await flush();
    expect(container.textContent).toContain("No replay yet");
    expect(window.close).not.toHaveBeenCalled();
  });
});

function draft(id: string, createdAt: number): Draft {
  return {
    id,
    createdAt,
    url: "https://a.co/x",
    kind: "screenshot",
    events: [],
  };
}

describe("drafts", () => {
  it("shows the empty state and returns home", async () => {
    await putDraft(draft("d1", Date.now()));
    mount();
    await flush();
    click(q("[class*='draftsPill']"));
    // delete the only draft, then reopen drafts to see the empty state
    click(q("[aria-label='Delete draft']"));
    await flush();
    expect(container.textContent).toContain("No unfinished drafts");
    click(q("[aria-label='Back']"));
    expect(q("h1").textContent).toBe("rewind");
  });

  it("shows a screenshot draft row and opens it", async () => {
    // Local time, not `new Date("2026-01-16")` (UTC midnight): west of UTC
    // that parses back to 15 Jan via `formatDraftDate`'s local `getDate()`.
    await putDraft(draft("d1", new Date(2026, 0, 16).getTime()));
    mount();
    await flush();
    click(q("[class*='draftsPill']"));
    expect(container.textContent).toContain("a.co/x");
    expect(container.textContent).toContain("Screenshot");
    expect(container.textContent).toContain("16 Jan");
    click(q("[class*='openButton']"));
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: expect.stringContaining("editor.html?id=d1"),
    });
  });

  it("shows a video draft's duration", async () => {
    await putDraft({
      ...draft("d2", Date.now()),
      kind: "video",
      durationSeconds: 65,
    });
    mount();
    await flush();
    click(q("[class*='draftsPill']"));
    expect(container.textContent).toContain("1:05");
  });

  it("shows 0:00 for a video draft with no duration", async () => {
    await putDraft({ ...draft("d5", Date.now()), kind: "video" });
    mount();
    await flush();
    click(q("[class*='draftsPill']"));
    expect(container.textContent).toContain("0:00");
  });

  it("shows a replay draft as Replay", async () => {
    await putDraft({ ...draft("d3", Date.now()), kind: "replay" });
    mount();
    await flush();
    click(q("[class*='draftsPill']"));
    expect(container.textContent).toContain("Replay");
  });

  it("falls back to the raw url when it does not parse", async () => {
    await putDraft({ ...draft("d4", Date.now()), url: "not a url" });
    mount();
    await flush();
    click(q("[class*='draftsPill']"));
    expect(container.textContent).toContain("not a url");
  });
});

describe("settings", () => {
  async function openSettings() {
    mount();
    await flush();
    click(q("[aria-label='More']"));
    click(q("[class*='menuItem']"));
  }

  it("saves a valid app URL on blur", async () => {
    await openSettings();
    const input = q("#rw-app-url") as HTMLInputElement;
    change(input, "https://example.com");
    blur(input);
    await flush();
    expect(await settings.getValue()).toMatchObject({
      appUrl: "https://example.com",
    });
    expect(container.querySelector("[class*='error']")).toBeNull();
  });

  it("shows an inline error and does not save an invalid URL", async () => {
    await openSettings();
    const input = q("#rw-app-url") as HTMLInputElement;
    change(input, "not a url");
    blur(input);
    await flush();
    expect(container.textContent).toContain("Enter a valid http(s) URL");
    expect(await settings.getValue()).toMatchObject({
      appUrl: DEFAULTS.appUrl,
    });
  });

  it("Reset restores defaults and shows the default app URL", async () => {
    await openSettings();
    const input = q("#rw-app-url") as HTMLInputElement;
    change(input, "https://example.com");
    blur(input);
    await flush();
    const reset = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Reset",
    ) as HTMLButtonElement;
    await act(async () => {
      reset.click();
    });
    await flush();
    expect(await settings.getValue()).toEqual(DEFAULTS);
    expect((q("#rw-app-url") as HTMLInputElement).value).toBe(DEFAULTS.appUrl);
  });

  it("updates the name", async () => {
    await openSettings();
    const input = q("#rw-name") as HTMLInputElement;
    change(input, "Ada Lovelace");
    blur(input);
    await flush();
    expect(await settings.getValue()).toMatchObject({
      reporterName: "Ada Lovelace",
    });
  });

  it("toggles open-in-new-tab", async () => {
    await openSettings();
    const toggle = q(
      "[aria-label='Open Rewinds in a new tab']",
    ) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    click(toggle);
    await flush();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(await settings.getValue()).toMatchObject({ openInNewTab: false });
  });

  it("toggles capture user events", async () => {
    await openSettings();
    const toggle = q("[aria-label='Capture user events']") as HTMLButtonElement;
    click(toggle);
    await flush();
    expect(await settings.getValue()).toMatchObject({
      captureUserEvents: false,
    });
  });

  it("switches the appearance segment and applies the theme", async () => {
    await openSettings();
    const segments = qAll("[class*='segment']");
    const appearance = segments[0]!;
    const dark = Array.from(appearance.querySelectorAll("button")).find(
      (b) => b.textContent === "Dark",
    )!;
    click(dark);
    await flush();
    expect(await settings.getValue()).toMatchObject({ theme: "dark" });
    expect(document.body.classList.contains("rw-dark")).toBe(true);
  });

  it("opens the browser's shortcut settings when available", async () => {
    const openShortcutSettings = vi.fn();
    Object.defineProperty(browser.commands, "openShortcutSettings", {
      value: openShortcutSettings,
      configurable: true,
    });
    await openSettings();
    click(q("[class*='shortcutsButton']"));
    expect(openShortcutSettings).toHaveBeenCalled();
    Object.defineProperty(browser.commands, "openShortcutSettings", {
      value: undefined,
      configurable: true,
    });
  });

  it("opens chrome://extensions/shortcuts when unavailable", async () => {
    Object.defineProperty(browser.commands, "openShortcutSettings", {
      value: undefined,
      configurable: true,
    });
    await openSettings();
    click(q("[class*='shortcutsButton']"));
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "chrome://extensions/shortcuts",
    });
  });

  it("toggles instant replay", async () => {
    await openSettings();
    const toggle = q(
      "[aria-label='Enable instant replay']",
    ) as HTMLButtonElement;
    click(toggle);
    await flush();
    expect(await settings.getValue()).toMatchObject({ instantReplay: true });
  });

  it("resets settings", async () => {
    await settings.setValue({ ...DEFAULTS, reporterName: "Someone" });
    await openSettings();
    click(q("[class*='resetButton']"));
    await flush();
    expect(await settings.getValue()).toEqual(DEFAULTS);
  });

  it("goes back to home", async () => {
    await openSettings();
    click(q("[aria-label='Back']"));
    expect(q("h1").textContent).toBe("rewind");
  });
});

// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDraft, putDraft, type Draft } from "../../lib/drafts";
import { resetSettings, settings, updateSettings } from "../../lib/settings";

// vi.hoisted, not plain top-level consts: the mock factories below run when
// Editor (imported statically further down, so its whole module graph loads
// eagerly) pulls in these modules, which happens before a plain `const`
// here would be initialized.
const { tabsCreate, encodeFrames, exportImage, remux, fileDraft } = vi.hoisted(
  () => ({
    tabsCreate: vi.fn(async () => undefined),
    encodeFrames: vi.fn(),
    exportImage: vi.fn(),
    remux: vi.fn(),
    fileDraft: vi.fn(),
  }),
);
vi.mock("wxt/browser", () => ({
  browser: { tabs: { create: tabsCreate } },
}));
vi.mock("../../lib/media", () => ({
  encodeFrames: (...a: unknown[]) => encodeFrames(...a),
  exportImage: (...a: unknown[]) => exportImage(...a),
  remux: (...a: unknown[]) => remux(...a),
}));
vi.mock("../../lib/upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/upload")>();
  return {
    ...actual,
    fileDraft: (...a: unknown[]) => fileDraft(...a),
  };
});

import Editor from "../../entrypoints/editor/Editor";

let root: Root;
let container: HTMLDivElement;
let closeSpy: ReturnType<typeof vi.spyOn>;
let assignSpy: ReturnType<typeof vi.spyOn>;
const createObjectURL = vi.fn(() => "blob:mock-url");
const revokeObjectURL = vi.fn();
const clipboardWrite = vi.fn(async () => undefined);

const nativeValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

/** Sets a controlled input's value through React's own value tracker, so its onChange fires. */
function setInputValue(el: HTMLInputElement, value: string): void {
  nativeValueSetter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function pngBlob(): Blob {
  return new Blob(["img"], { type: "image/png" });
}

function webmBlob(): Blob {
  return new Blob(["v"], { type: "video/webm" });
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(id: string): Promise<void> {
  window.history.pushState({}, "", `/editor.html?id=${id}`);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Editor />);
  });
  await flushMicrotasks();
}

beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  await resetSettings();

  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboardWrite },
    configurable: true,
  });
  closeSpy = vi.spyOn(window, "close").mockImplementation(() => undefined);
  assignSpy = vi.spyOn(window.location, "assign").mockImplementation(() => {
    // jsdom/happy-dom navigation is not implemented; swallow it.
  });
});

afterEach(() => {
  root?.unmount();
  container?.remove();
  closeSpy.mockRestore();
  assignSpy.mockRestore();
});

describe("Editor", () => {
  it("shows a message when the draft is missing", async () => {
    await mount("nope");
    expect(container.textContent).toContain("not found");
  });

  it("treats a missing ?id= the same as an unknown draft", async () => {
    window.history.pushState({}, "", "/editor.html");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Editor />);
    });
    await flushMicrotasks();
    expect(container.textContent).toContain("not found");
  });

  it("ignores the load once the page has unmounted", async () => {
    window.history.pushState({}, "", "/editor.html?id=racey");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // Sync act only flushes the render and the effect's synchronous setup
    // (up to its first await), so unmount below always lands before the
    // mocked getDraft's promise resolves — unlike an async act, which would
    // let that promise settle first and race unmount against it.
    act(() => {
      root.render(<Editor />);
    });
    root.unmount();
    await flushMicrotasks();
    // No error thrown after unmount is the assertion; nothing left to check.
  });

  it("ignores a replay encoded after the page has unmounted", async () => {
    await putDraft({
      id: "racey-replay",
      createdAt: Date.now(),
      url: "https://example.com/cart",
      kind: "replay",
      frames: [{ at: 0, blob: pngBlob() }],
      events: [],
    });
    encodeFrames.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ blob: webmBlob(), durationSeconds: 1 }),
            0,
          ),
        ),
    );
    window.history.pushState({}, "", "/editor.html?id=racey-replay");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Editor />);
    });
    root.unmount();
    await flushMicrotasks();
    // No error thrown after unmount is the assertion; nothing left to check.
  });

  describe("screenshot flow", () => {
    async function putScreenshot(id: string): Promise<void> {
      const draft: Draft = {
        id,
        createdAt: Date.now(),
        url: "https://example.com/cart",
        kind: "screenshot",
        blob: pngBlob(),
        events: [
          { t: 1, kind: "click", text: "Clicked “Buy”", isError: false },
          { t: 2, kind: "err", text: "boom", isError: true },
          { t: 3, kind: "net", text: "GET /api · 200", isError: false },
        ],
      };
      await putDraft(draft);
    }

    it("draws a box, edits its label and undoes it", async () => {
      await putScreenshot("shot1");
      await mount("shot1");
      const img = container.querySelector("img") as HTMLImageElement;
      Object.defineProperty(img, "naturalWidth", {
        value: 800,
        configurable: true,
      });
      img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 400 }) as DOMRect;

      const wrap = container.querySelector(
        "[class*='imageWrap']",
      ) as HTMLDivElement;
      await act(async () => {
        wrap.dispatchEvent(
          new Event("pointerdown", { bubbles: true }) as unknown as Event,
        );
      });
      // React's synthetic events need real dispatch through the handler props;
      // simulate via the same element using React's testing-friendly approach.
      const pointerDown = new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      });
      const pointerMove = new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 60,
        clientY: 60,
      });
      const pointerUp = new MouseEvent("pointerup", { bubbles: true });
      await act(async () => {
        wrap.dispatchEvent(pointerDown);
        wrap.dispatchEvent(pointerMove);
        wrap.dispatchEvent(pointerUp);
      });

      const label = container.querySelector(
        "[class*='labelInput']",
      ) as HTMLInputElement;
      expect(label).not.toBeNull();
      await act(async () => {
        setInputValue(label, "Total is wrong");
      });
      expect(label.value).toBe("Total is wrong");

      const undo = container.querySelector(
        "[class*='undoButton']",
      ) as HTMLButtonElement;
      await act(async () => {
        undo.click();
      });
      expect(container.querySelector("[class*='labelInput']")).toBeNull();
    });

    it("ignores a pointermove with no prior pointerdown", async () => {
      await putScreenshot("shot1a");
      await mount("shot1a");

      const wrap = container.querySelector(
        "[class*='imageWrap']",
      ) as HTMLDivElement;
      await act(async () => {
        wrap.dispatchEvent(
          new MouseEvent("pointermove", {
            bubbles: true,
            clientX: 50,
            clientY: 50,
          }),
        );
      });

      expect(container.querySelector("[class*='labelInput']")).toBeNull();
    });

    it("labels the second of two boxes without disturbing the first", async () => {
      await putScreenshot("shot1c");
      await mount("shot1c");

      const wrap = container.querySelector(
        "[class*='imageWrap']",
      ) as HTMLDivElement;
      const draw = async (x1: number, y1: number, x2: number, y2: number) => {
        await act(async () => {
          wrap.dispatchEvent(
            new MouseEvent("pointerdown", {
              bubbles: true,
              clientX: x1,
              clientY: y1,
            }),
          );
          wrap.dispatchEvent(
            new MouseEvent("pointermove", {
              bubbles: true,
              clientX: x2,
              clientY: y2,
            }),
          );
          wrap.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
        });
      };
      await draw(0, 0, 40, 40);
      await draw(50, 50, 90, 90);

      const labels = container.querySelectorAll(
        "[class*='labelInput']",
      ) as NodeListOf<HTMLInputElement>;
      expect(labels.length).toBe(2);
      await act(async () => {
        setInputValue(labels[1]!, "Second box");
      });
      expect(labels[0]!.value).toBe("");
      expect(labels[1]!.value).toBe("Second box");
    });

    it("ignores a drag too small to be a box", async () => {
      await putScreenshot("shot1b");
      await mount("shot1b");

      const wrap = container.querySelector(
        "[class*='imageWrap']",
      ) as HTMLDivElement;
      const pointerDown = new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      });
      const pointerMove = new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 11,
        clientY: 11,
      });
      const pointerUp = new MouseEvent("pointerup", { bubbles: true });
      await act(async () => {
        wrap.dispatchEvent(pointerDown);
        wrap.dispatchEvent(pointerMove);
        wrap.dispatchEvent(pointerUp);
      });

      expect(container.querySelector("[class*='labelInput']")).toBeNull();
    });

    it("shows Discard, deletes the draft and closes on click", async () => {
      await putScreenshot("shot2");
      await mount("shot2");
      const close = container.querySelector(
        "[class*='closeButton']",
      ) as HTMLButtonElement;
      expect(close.textContent).toBe("Discard");
      await act(async () => {
        close.click();
        await Promise.resolve();
      });
      expect(await getDraft("shot2")).toBeUndefined();
      expect(closeSpy).toHaveBeenCalled();
    });

    it("requires a name when reporterName is unset, then creates the link", async () => {
      await putScreenshot("shot3");
      exportImage.mockResolvedValue(pngBlob());
      fileDraft.mockResolvedValue({
        id: "r1",
        viewerUrl: "https://app.test/r/r1",
      });
      await mount("shot3");

      const nameField = container.querySelector(
        "#rw-editor-name",
      ) as HTMLInputElement;
      expect(nameField).not.toBeNull();

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
        await Promise.resolve();
      });
      expect(container.textContent).toContain("Your name is required");
      expect(fileDraft).not.toHaveBeenCalled();

      await act(async () => {
        setInputValue(nameField, "Dhiaz");
      });
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();

      expect(fileDraft).toHaveBeenCalledTimes(1);
      const arg = fileDraft.mock.calls[0]![0];
      expect(arg.contentType).toBe("image/png");
      expect(arg.rewind.reporterName).toBe("Dhiaz");
      expect(arg.rewind.kind).toBe("screenshot");
      expect(clipboardWrite).toHaveBeenCalledWith("https://app.test/r/r1");
      expect(tabsCreate).toHaveBeenCalledWith({
        url: "https://app.test/r/r1",
      });
      expect(closeSpy).toHaveBeenCalled();
      expect((await settings.getValue()).reporterName).toBe("Dhiaz");
    });

    it("shows the create error and keeps the draft on failure", async () => {
      await updateSettings({ reporterName: "Preset" });
      await putScreenshot("shot4");
      exportImage.mockResolvedValue(pngBlob());
      fileDraft.mockRejectedValue(new Error("POST /api/rewinds failed: 500"));
      await mount("shot4");

      expect(container.querySelector("#rw-editor-name")).toBeNull();

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();

      expect(container.textContent).toContain("POST /api/rewinds failed: 500");
      expect(await getDraft("shot4")).toBeDefined();
      expect(cta.disabled).toBe(false);
    });

    it("falls back to a generic message when the failure is not an Error", async () => {
      await updateSettings({ reporterName: "Preset" });
      await putScreenshot("shot5");
      exportImage.mockResolvedValue(pngBlob());
      fileDraft.mockRejectedValue("boom");
      await mount("shot5");

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();

      expect(container.textContent).toContain("Could not create the link");
    });
  });

  describe("video flow", () => {
    async function putVideo(id: string): Promise<void> {
      const draft: Draft = {
        id,
        createdAt: Date.now(),
        url: "https://example.com/cart",
        kind: "video",
        blob: webmBlob(),
        durationSeconds: 10,
        events: [
          { t: 1, kind: "click", text: "Clicked “Buy”", isError: false },
          { t: 9, kind: "net", text: "GET /api · 200", isError: false },
        ],
      };
      await putDraft(draft);
    }

    it("shows Save for later and only closes the window", async () => {
      await putVideo("vid1");
      await mount("vid1");
      const close = container.querySelector(
        "[class*='closeButton']",
      ) as HTMLButtonElement;
      expect(close.textContent).toBe("Save for later");
      await act(async () => {
        close.click();
      });
      expect(closeSpy).toHaveBeenCalled();
      expect(await getDraft("vid1")).toBeDefined();
    });

    it("remuxes the full range by default", async () => {
      await updateSettings({ reporterName: "Preset", openInNewTab: false });
      await putVideo("vid2");
      remux.mockResolvedValue({ blob: webmBlob(), durationSeconds: 10 });
      fileDraft.mockResolvedValue({
        id: "r2",
        viewerUrl: "https://app.test/r/r2",
      });
      await mount("vid2");

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();
      expect(remux.mock.calls[0]![1]).toEqual({ start: 0, end: 10 });
      expect(assignSpy).toHaveBeenCalledWith("https://app.test/r/r2");
    });

    it("drags the start handle, then remuxes only the trimmed range", async () => {
      await updateSettings({ reporterName: "Preset" });
      await putVideo("vid2b");
      remux.mockResolvedValue({ blob: webmBlob(), durationSeconds: 7 });
      fileDraft.mockResolvedValue({
        id: "r2b",
        viewerUrl: "https://app.test/r/r2b",
      });
      await mount("vid2b");

      // Drag the start handle to 3s of a 10s bar rendered at a 100px-wide
      // parent (happy-dom reports a zero-width rect, so the bar's own
      // getBoundingClientRect is stubbed to give the drag math a real width).
      const handles = container.querySelectorAll("[role='slider']");
      const bar = handles[0]!.parentElement as HTMLDivElement;
      bar.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
      const down = new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 0,
      });
      await act(async () => {
        handles[0]!.dispatchEvent(down);
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 30 }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent("pointerup"));
      });
      expect(handles[0]!.getAttribute("aria-valuenow")).toBe("3");

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();
      expect(remux.mock.calls[0]![1]).toEqual({ start: 3, end: 10 });
    });

    it("shows the singular 'second' label for a 1-second video", async () => {
      await putDraft({
        id: "vid1s",
        createdAt: Date.now(),
        url: "https://example.com/cart",
        kind: "video",
        blob: webmBlob(),
        durationSeconds: 1,
        events: [],
      });
      await mount("vid1s");

      const durationLabel = container.querySelector(
        "[class*='durationLabel']",
      ) as HTMLDivElement;
      expect(durationLabel.textContent).toBe("1 second");
    });

    it("drags the end handle, then remuxes only the trimmed range", async () => {
      await updateSettings({ reporterName: "Preset" });
      await putVideo("vid2c");
      remux.mockResolvedValue({ blob: webmBlob(), durationSeconds: 6 });
      fileDraft.mockResolvedValue({
        id: "r2c",
        viewerUrl: "https://app.test/r/r2c",
      });
      await mount("vid2c");

      const handles = container.querySelectorAll("[role='slider']");
      const bar = handles[1]!.parentElement as HTMLDivElement;
      bar.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
      const down = new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 100,
      });
      await act(async () => {
        handles[1]!.dispatchEvent(down);
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 60 }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent("pointerup"));
      });
      expect(handles[1]!.getAttribute("aria-valuenow")).toBe("6");

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();
      expect(remux.mock.calls[0]![1]).toEqual({ start: 0, end: 6 });
    });

    it("uses a custom title over the default when set", async () => {
      await updateSettings({ reporterName: "Preset" });
      await putVideo("vid2d");
      remux.mockResolvedValue({ blob: webmBlob(), durationSeconds: 10 });
      fileDraft.mockResolvedValue({
        id: "r2d",
        viewerUrl: "https://app.test/r/r2d",
      });
      await mount("vid2d");

      const titleInput = container.querySelector(
        "[class*='titleInput']",
      ) as HTMLInputElement;
      await act(async () => {
        setInputValue(titleInput, "My custom title");
      });
      expect(titleInput.value).toBe("My custom title");

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();
      expect(fileDraft.mock.calls[0]![0].rewind.title).toBe("My custom title");
    });

    it("swallows a clipboard failure and still opens the viewer", async () => {
      await updateSettings({ reporterName: "Preset" });
      await putVideo("vid3");
      remux.mockResolvedValue({ blob: webmBlob(), durationSeconds: 10 });
      fileDraft.mockResolvedValue({
        id: "r3",
        viewerUrl: "https://app.test/r/r3",
      });
      clipboardWrite.mockRejectedValueOnce(new Error("denied"));
      await mount("vid3");

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();

      expect(tabsCreate).toHaveBeenCalledWith({
        url: "https://app.test/r/r3",
      });
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe("replay draft", () => {
    it("encodes the frames into a video, then remuxes that encoded blob", async () => {
      await updateSettings({ reporterName: "Preset" });
      const draft: Draft = {
        id: "rep1",
        createdAt: Date.now(),
        url: "https://example.com/cart",
        kind: "replay",
        frames: [
          { at: 0, blob: pngBlob() },
          { at: 1000, blob: pngBlob() },
        ],
        events: [{ t: 0.5, kind: "log", text: "hi", isError: false }],
      };
      await putDraft(draft);
      const encoded = webmBlob();
      encodeFrames.mockResolvedValue({ blob: encoded, durationSeconds: 2 });
      remux.mockResolvedValue({ blob: webmBlob(), durationSeconds: 2 });
      fileDraft.mockResolvedValue({
        id: "r4",
        viewerUrl: "https://app.test/r/r4",
      });
      const fetchMock = vi.fn(async () => ({
        blob: async () => encoded,
      }));
      vi.stubGlobal("fetch", fetchMock);

      await mount("rep1");
      expect(encodeFrames).toHaveBeenCalledTimes(1);
      expect(encodeFrames.mock.calls[0]![0]).toHaveLength(2);

      const cta = container.querySelector(
        "[class*='cta']",
      ) as HTMLButtonElement;
      await act(async () => {
        cta.click();
      });
      await flushMicrotasks();

      expect(fetchMock).toHaveBeenCalledWith("blob:mock-url");
      expect(remux).toHaveBeenCalledWith(encoded, { start: 0, end: 2 });
      const arg = fileDraft.mock.calls[0]![0];
      expect(arg.rewind.kind).toBe("video");
      vi.unstubAllGlobals();
    });
  });
});

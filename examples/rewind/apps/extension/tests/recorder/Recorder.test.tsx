// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSettings, updateSettings } from "../../lib/settings";

const tabsGet = vi.fn(async () => ({
  url: "https://example.com/page" as string | undefined,
}));
const tabsCreate = vi.fn(async () => undefined);
const getURL = vi.fn((path: string) => `chrome-extension://ext${path}`);

vi.mock("wxt/browser", () => ({
  browser: {
    tabs: { get: tabsGet, create: tabsCreate },
    runtime: { getURL },
  },
}));

const send = vi.fn();
vi.mock("../../lib/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/messages")>();
  return { ...actual, send: (...args: unknown[]) => send(...args) };
});

const openTabStream = vi.fn();
const openDisplayStream = vi.fn();
const openMic = vi.fn();
const cropTrack = vi.fn();
const startRecorder = vi.fn();

vi.mock("../../lib/media", () => ({
  openTabStream: (...a: unknown[]) => openTabStream(...a),
  openDisplayStream: (...a: unknown[]) => openDisplayStream(...a),
  openMic: (...a: unknown[]) => openMic(...a),
  cropTrack: (...a: unknown[]) => cropTrack(...a),
  startRecorder: (...a: unknown[]) => startRecorder(...a),
}));

const putDraft = vi.fn<(draft: unknown) => Promise<undefined>>(
  async () => undefined,
);
vi.mock("../../lib/drafts", () => ({
  putDraft: (a: unknown) => putDraft(a),
}));

type Listener = () => void;

function fakeTrack(kind: string) {
  const listeners: Record<string, Listener[]> = {};
  return {
    kind,
    enabled: true,
    stop: vi.fn(),
    addEventListener: (type: string, cb: Listener) => {
      (listeners[type] ??= []).push(cb);
    },
    removeEventListener: vi.fn(),
    dispatch(type: string): void {
      listeners[type]?.forEach((cb) => cb());
    },
  };
}

function fakeStream(tracks: ReturnType<typeof fakeTrack>[]) {
  return {
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getTracks: () => tracks,
  };
}

class FakeMediaStream {
  tracks: unknown[];
  constructor(tracks: unknown[]) {
    this.tracks = tracks;
  }
}

class FakeRecorderHandle {
  pause = vi.fn();
  resume = vi.fn();
  stop = vi.fn(async () => new Blob(["v"], { type: "video/webm" }));
}

let root: Root;
let container: HTMLDivElement;
let closeSpy: ReturnType<typeof vi.spyOn>;

async function mount(search: string): Promise<void> {
  window.history.pushState({}, "", `/recorder.html${search}`);
  const Recorder = (await import("../../entrypoints/recorder/Recorder"))
    .default;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Recorder />);
  });
}

async function flush(ms = 0): Promise<void> {
  const STEP = 250;
  let remaining = ms;
  do {
    const chunk = Math.min(STEP, remaining);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(chunk);
    });
    remaining -= chunk;
  } while (remaining > 0);
}

beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  await resetSettings();
  closeSpy = vi.spyOn(window, "close").mockImplementation(() => undefined);
  tabsGet.mockImplementation(async () => ({ url: "https://example.com/page" }));
  send.mockReset();
  send.mockImplementation(async (message: { type: string }) => {
    if (message.type === "events") return [];
    if (message.type === "area") return null;
    return undefined;
  });
  openTabStream.mockImplementation(async () =>
    fakeStream([fakeTrack("video")]),
  );
  openDisplayStream.mockImplementation(async () =>
    fakeStream([fakeTrack("video")]),
  );
  openMic.mockImplementation(async () => fakeStream([fakeTrack("audio")]));
  startRecorder.mockImplementation(() => new FakeRecorderHandle());
  vi.stubGlobal("MediaStream", FakeMediaStream);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Recorder: mode=tab", () => {
  it("opens the tab stream, counts down, records, and stops via the Stop button", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    expect(openTabStream).toHaveBeenCalledWith("abc");
    expect(container.textContent).toContain("Recording in 3");

    await flush(1000);
    expect(container.textContent).toContain("Recording in 2");
    await flush(1000);
    expect(container.textContent).toContain("Recording in 1");
    await flush(1000);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recording", tabId: 5 }),
    );
    expect(container.textContent).toMatch(/0:0\d/);

    const stopButton = container.querySelector(
      'button[aria-label="Stop"]',
    ) as HTMLButtonElement;
    await act(async () => {
      stopButton.click();
      await Promise.resolve();
    });
    await flush();

    expect(putDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "video",
        url: "https://example.com/page",
      }),
    );
    expect(tabsCreate).toHaveBeenCalledWith({
      url:
        "chrome-extension://ext/editor.html?id=" +
        (putDraft.mock.calls[0]![0] as { id: string }).id,
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it("defaults mode and stream when the URL omits them", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5");
    await flush();

    expect(openTabStream).toHaveBeenCalledWith("");
    expect(container.textContent).toContain("Recording in 3");
  });

  it("Stop during the countdown discards: no draft, hold released, no recorder starts", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    const stopButton = container.querySelector(
      'button[aria-label="Stop"]',
    ) as HTMLButtonElement;
    await act(async () => {
      stopButton.click();
      await Promise.resolve();
    });
    await flush(3000);

    expect(putDraft).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({
      type: "recording",
      tabId: 5,
      since: null,
    });
    expect(startRecorder).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("Closing the recorder window mid-recording releases the hold", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);
    send.mockClear();

    window.dispatchEvent(new Event("pagehide"));

    expect(send).toHaveBeenCalledWith({
      type: "recording",
      tabId: 5,
      since: null,
    });
  });

  it("pagehide after Stop does not send a second release", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);
    const stopButton = container.querySelector(
      'button[aria-label="Stop"]',
    ) as HTMLButtonElement;
    await act(async () => {
      stopButton.click();
      await Promise.resolve();
    });
    await flush();
    send.mockClear();

    window.dispatchEvent(new Event("pagehide"));

    expect(send).not.toHaveBeenCalled();
  });

  it("A second Stop click while the first is finalizing is a no-op", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);

    const stopButton = container.querySelector(
      'button[aria-label="Stop"]',
    ) as HTMLButtonElement;
    await act(async () => {
      stopButton.click();
      stopButton.click();
      await Promise.resolve();
    });
    await flush();

    expect(putDraft).toHaveBeenCalledTimes(1);
  });

  it("shows an error and still releases the hold when saving the recording fails", async () => {
    putDraft.mockRejectedValueOnce(new Error("quota exceeded"));
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);
    send.mockClear();

    const stopButton = container.querySelector(
      'button[aria-label="Stop"]',
    ) as HTMLButtonElement;
    await act(async () => {
      stopButton.click();
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain("quota exceeded");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recording", tabId: 5, since: null }),
    );
    // Failure means no draft to open: the window must stay open, not close
    // on a recording that was never saved.
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("lets Stop be clicked again after a failed save, and the retry saves a draft", async () => {
    putDraft.mockRejectedValueOnce(new Error("quota exceeded"));
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);

    const stopButton = container.querySelector(
      'button[aria-label="Stop"]',
    ) as HTMLButtonElement;
    await act(async () => {
      stopButton.click();
      await Promise.resolve();
    });
    await flush();
    expect(container.textContent).toContain("quota exceeded");

    await act(async () => {
      stopButton.click();
      await Promise.resolve();
    });
    await flush();

    expect(putDraft).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalled();
  });

  it("still releases the hold when the release message itself rejects", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);
    send.mockImplementation(async (message: { type: string }) => {
      if (message.type === "recording") throw new Error("no listener");
      if (message.type === "events") return [];
      return undefined;
    });

    const stopButton = container.querySelector(
      'button[aria-label="Stop"]',
    ) as HTMLButtonElement;
    await act(async () => {
      stopButton.click();
      await Promise.resolve();
    });
    await flush();

    expect(putDraft).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("shows an error instead of a blank window when starting the recorder fails", async () => {
    tabsGet.mockRejectedValueOnce(new Error("tab was closed"));
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    expect(container.textContent).toContain("tab was closed");
  });

  it("falls back to a generic message when the init failure isn't an Error", async () => {
    tabsGet.mockRejectedValueOnce("nope");
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    expect(container.textContent).toContain("Could not start recording");
  });

  it("falls back to a generic message when saving fails with a non-Error", async () => {
    putDraft.mockRejectedValueOnce("nope");
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);

    const stopButton = container.querySelector(
      'button[aria-label="Stop"]',
    ) as HTMLButtonElement;
    await act(async () => {
      stopButton.click();
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain("Could not save the recording");
  });

  it("unmounting while the tab URL fetch is pending aborts init without error", async () => {
    let resolveTab: (t: { url: string }) => void = () => undefined;
    tabsGet.mockImplementationOnce(
      () => new Promise((resolve) => (resolveTab = resolve)),
    );
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    act(() => {
      root.unmount();
    });
    resolveTab({ url: "https://example.com/page" });
    await flush();

    expect(openTabStream).not.toHaveBeenCalled();
  });

  it("unmounting before init fails does not render an error", async () => {
    let rejectTab: (err: unknown) => void = () => undefined;
    tabsGet.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectTab = reject)),
    );
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    act(() => {
      root.unmount();
    });
    rejectTab(new Error("boom"));
    await flush();

    expect(container.textContent).not.toContain("boom");
  });

  it("clicking the countdown panel pauses and resumes the countdown", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    const panel = container.querySelector(
      'button[aria-label="Pause the countdown"]',
    ) as HTMLButtonElement;
    await act(async () => {
      panel.click();
    });
    await flush(2000);
    // Paused: still on 3 after 2s would have ticked twice if running.
    expect(container.textContent).toContain("Recording in 3");

    await act(async () => {
      panel.click();
    });
    await flush(3000);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recording", tabId: 5 }),
    );
  });

  it("Pause/Resume toggles the recorder and the elapsed timer", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);

    const pauseButton = container.querySelector(
      'button[aria-label="Pause"]',
    ) as HTMLButtonElement;
    await act(async () => {
      pauseButton.click();
    });
    const handle = startRecorder.mock.results[0]!.value as FakeRecorderHandle;
    expect(handle.pause).toHaveBeenCalled();
    await flush(250); // the elapsed timer keeps ticking, frozen while paused

    const resumeButton = container.querySelector(
      'button[aria-label="Resume"]',
    ) as HTMLButtonElement;
    await act(async () => {
      resumeButton.click();
    });
    expect(handle.resume).toHaveBeenCalled();
  });

  it("a video track ended event stops the recording", async () => {
    const track = fakeTrack("video");
    openTabStream.mockImplementation(async () => fakeStream([track]));
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);

    await act(async () => {
      track.dispatch("ended");
      await Promise.resolve();
    });
    await flush();
    expect(putDraft).toHaveBeenCalled();
  });

  it("closing the recorded tab still saves a draft with the tab's url", async () => {
    const track = fakeTrack("video");
    openTabStream.mockImplementation(async () => fakeStream([track]));
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);

    tabsGet.mockRejectedValue(new Error("No tab with id: 5"));
    await act(async () => {
      track.dispatch("ended");
      await Promise.resolve();
    });
    await flush();

    expect(putDraft).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/page" }),
    );
    expect(closeSpy).toHaveBeenCalled();
  });

  it("mic on: toggling mic mutes/unmutes the track", async () => {
    const micTrack = fakeTrack("audio");
    openMic.mockImplementation(async () => fakeStream([micTrack]));
    await updateSettings({ micOn: true, micDeviceId: "default" });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    expect(container.textContent).toContain("Your microphone is ON");

    await flush(3000);
    const micButton = container.querySelector(
      'button[aria-label="Mute microphone"]',
    ) as HTMLButtonElement;
    await act(async () => {
      micButton.click();
    });
    expect(micTrack.enabled).toBe(false);
  });

  it("mic on but unavailable: shows the message and continues without audio", async () => {
    openMic.mockImplementation(async () => {
      throw new Error("denied");
    });
    await updateSettings({ micOn: true });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    expect(container.textContent).toContain("Your microphone is OFF");
    await flush(3000);
    expect(container.textContent).toContain("Microphone unavailable");
    const micButton = container.querySelector(
      'button[aria-label="Mute microphone"]',
    ) as HTMLButtonElement;
    expect(micButton.disabled).toBe(true);
  });

  it("Discard releases the hold and closes without saving a draft", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);

    const discardButton = container.querySelector(
      'button[aria-label="Discard"]',
    ) as HTMLButtonElement;
    await act(async () => {
      discardButton.click();
      await Promise.resolve();
    });

    expect(send).toHaveBeenCalledWith({
      type: "recording",
      tabId: 5,
      since: null,
    });
    expect(putDraft).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("Discard during the countdown (no recorder, no open span) still releases the hold", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    const discardButton = container.querySelector(
      'button[aria-label="Discard"]',
    ) as HTMLButtonElement;
    await act(async () => {
      discardButton.click();
      await Promise.resolve();
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it("Discard swallows a rejecting recorder.stop()", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);
    const handle = startRecorder.mock.results[0]!.value as FakeRecorderHandle;
    handle.stop.mockRejectedValueOnce(new Error("nope"));

    const discardButton = container.querySelector(
      'button[aria-label="Discard"]',
    ) as HTMLButtonElement;
    await act(async () => {
      discardButton.click();
      await Promise.resolve();
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it("closes instead of recording when the tab has no http(s) url", async () => {
    // A missing/non-http(s) url must never become a draft: `defaultTitle`
    // and `fileDraft` both call `new URL(draft.url)` and would crash on "".
    tabsGet.mockResolvedValueOnce({ url: undefined });
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();

    expect(closeSpy).toHaveBeenCalled();
    expect(putDraft).not.toHaveBeenCalled();
  });

  it("mic on: no audio track on the mic stream still counts as mic on", async () => {
    openMic.mockImplementation(async () => fakeStream([]));
    await updateSettings({ micOn: true });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush();
    expect(container.textContent).toContain("Your microphone is ON");
  });

  it("ticks the elapsed timer while actively recording (not paused)", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    await flush(3000);
    await flush(250);
    expect(container.textContent).toMatch(/0:0\d/);
  });

  it("unmounting before the tab stream resolves aborts init without error", async () => {
    let resolveStream: (s: unknown) => void = () => undefined;
    openTabStream.mockImplementation(
      () => new Promise((resolve) => (resolveStream = resolve)),
    );
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=tab&stream=abc");
    act(() => {
      root.unmount();
    });
    resolveStream(fakeStream([fakeTrack("video")]));
    await flush();
  });
});

describe("Recorder: mode=area", () => {
  it("crops the video track when the background returns a rect", async () => {
    const cropped = fakeTrack("video");
    cropTrack.mockReturnValue(cropped);
    send.mockImplementation(async (message: { type: string }) => {
      if (message.type === "area") {
        return { x: 0, y: 0, width: 10, height: 10, viewportWidth: 100 };
      }
      if (message.type === "events") return [];
      return undefined;
    });
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=area&stream=abc");
    await flush();

    expect(cropTrack).toHaveBeenCalled();
    await flush(3000);
    expect(container.textContent).toMatch(/0:0\d/);
  });

  it("closes the window when the background returns a null rect", async () => {
    send.mockImplementation(async (message: { type: string }) => {
      if (message.type === "area") return null;
      return undefined;
    });
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=area&stream=abc");
    await flush();

    expect(closeSpy).toHaveBeenCalled();
    expect(cropTrack).not.toHaveBeenCalled();
  });

  it("unmounting while the area rect is pending aborts before acting on it", async () => {
    let resolveRect: (r: unknown) => void = () => undefined;
    send.mockImplementation(
      (message: { type: string }) =>
        new Promise((resolve) => {
          if (message.type === "area") resolveRect = resolve;
          else resolve(undefined);
        }),
    );
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=area&stream=abc");
    await flush();
    act(() => {
      root.unmount();
    });
    resolveRect({ x: 0, y: 0, width: 10, height: 10, viewportWidth: 100 });
    await flush();
    expect(cropTrack).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });
});

describe("Recorder: mode=desktop", () => {
  it("shows a picker button, then counts down after the user picks a source", async () => {
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=desktop");
    await flush();

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Choose what to record");

    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    await flush();
    expect(openDisplayStream).toHaveBeenCalled();
    expect(container.textContent).toContain("Recording in 3");
  });

  it("shows a retry button when the picker is cancelled", async () => {
    openDisplayStream.mockImplementation(async () => {
      throw new Error("cancelled");
    });
    await updateSettings({ micOn: false });
    await mount("?tab=5&mode=desktop");
    await flush();

    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain("Nothing to record");

    openDisplayStream.mockImplementation(async () =>
      fakeStream([fakeTrack("video")]),
    );
    const retryButton = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      retryButton.click();
      await Promise.resolve();
    });
    await flush();
    expect(container.textContent).toContain("Recording in 3");
  });
});

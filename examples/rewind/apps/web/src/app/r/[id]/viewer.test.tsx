// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RewindDetail } from "@/lib/rewinds";

// A mutable stand-in for the flags module: flipped per test instead of
// vi.resetModules() + vi.doMock() + a dynamic re-import, which re-executes
// viewer.tsx under a fresh module instance per test and makes v8's coverage
// merge across those instances nondeterministic.
const mockFlags = vi.hoisted(() => ({
  AI_SUMMARY: false,
  SIMILAR_MERGE: false,
  INTEGRATIONS: false,
}));
vi.mock("@/lib/flags", () => ({ flags: mockFlags }));

import { Viewer } from "./viewer";

afterEach(() => {
  mockFlags.AI_SUMMARY = false;
  mockFlags.SIMILAR_MERGE = false;
  mockFlags.INTEGRATIONS = false;
});

function videoRewind(): RewindDetail {
  return {
    id: "seed-r1",
    workspaceId: "w1",
    title: "Checkout fails after applying coupon",
    url: "https://shop.acme.co/cart",
    reporterName: "Maya Chen",
    status: "new",
    kind: "video",
    mediaKey: "rewinds/seed-r1.webm",
    durationSeconds: 42,
    folderId: null,
    recordingLinkId: null,
    errorSignature: null,
    createdAt: new Date(Date.now() - 5 * 60_000),
    updatedAt: new Date(),
    events: [
      {
        id: "e0",
        rewindId: "seed-r1",
        t: 0,
        kind: "nav",
        text: "Navigated to /cart",
        isError: false,
      },
      {
        id: "e1",
        rewindId: "seed-r1",
        t: 2,
        kind: "click",
        text: "Clicked field",
        isError: false,
      },
      {
        id: "e2",
        rewindId: "seed-r1",
        t: 4,
        kind: "net",
        text: "GET /api/cart",
        isError: false,
      },
      {
        id: "e3",
        rewindId: "seed-r1",
        t: 14,
        kind: "log",
        text: "checkout:start",
        isError: false,
      },
      {
        id: "e4",
        rewindId: "seed-r1",
        t: 17,
        kind: "net",
        text: "POST /api/checkout 500",
        isError: true,
      },
      {
        id: "e5",
        rewindId: "seed-r1",
        t: 21,
        kind: "warn",
        text: "Retrying",
        isError: false,
      },
      {
        id: "e6",
        rewindId: "seed-r1",
        t: 18,
        kind: "err",
        text: "TypeError",
        isError: true,
      },
    ] as unknown as RewindDetail["events"],
    comments: [
      {
        id: "c0",
        rewindId: "seed-r1",
        t: 18,
        x: 70,
        y: 18,
        author: "Leo Park",
        text: "This is the 500.",
        createdAt: new Date(),
      },
    ] as unknown as RewindDetail["comments"],
  };
}

function zeroDurationRewind(): RewindDetail {
  return { ...videoRewind(), id: "seed-r0", durationSeconds: 0 };
}

function screenshotRewind(): RewindDetail {
  return {
    ...videoRewind(),
    id: "seed-r4",
    kind: "screenshot",
    mediaKey: "rewinds/seed-r4.png",
    durationSeconds: null,
    events: [],
    comments: [],
  };
}

let container: HTMLDivElement;
let root: Root;

function mount(el: React.ReactElement) {
  act(() => {
    root.render(el);
  });
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 200 }),
  );
  stubClipboard(vi.fn().mockResolvedValue(undefined));
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
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

describe("tabs", () => {
  it("switches between Summary, Actions, Console, Network and Comments", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const tabs = qAll('[role="tab"]');
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Summary",
      "Actions",
      "Console",
      "Network",
      "Comments 1",
    ]);
    click(tabs[1]!);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("Navigated to /cart");

    click(tabs[2]!);
    expect(container.textContent).toContain("checkout:start");

    click(tabs[3]!);
    expect(container.textContent).toContain("GET /api/cart");

    click(tabs[4]!);
    expect(container.textContent).toContain("This is the 500.");
  });
});

describe("seeking", () => {
  it("seeks from an event row", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    click(q('[role="tab"]:nth-of-type(2)'));
    const row = qAll(`.eventRow, [class*="eventRow"]`).find((r) =>
      r.textContent?.includes("Clicked field"),
    )!;
    click(row);
    expect(container.textContent).toContain("0:02 / 0:42");
  });

  it("seeks from a step in Summary", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const step = qAll('[data-testid="step"]').find((r) =>
      r.textContent?.includes("Navigated to /cart"),
    )!;
    click(step);
    expect(container.textContent).toContain("0:00 / 0:42");
  });

  it("seeks from a comment row", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    click(qAll('[role="tab"]')[4]!);
    const row = qAll('[class*="commentRow"]')[0]!;
    click(row);
    expect(container.textContent).toContain("0:18 / 0:42");
  });

  it("seeks from the timeline", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const slider = q('[role="slider"]');
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      slider.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 50 }),
      );
    });
    expect(slider.getAttribute("aria-valuenow")).toBe("21");
  });

  it("±5s buttons move the playhead", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const buttons = qAll("button").filter(
      (b) => b.textContent === "+5s" || b.textContent === "−5s",
    );
    const plus = buttons.find((b) => b.textContent === "+5s")!;
    click(plus);
    expect(container.textContent).toContain("0:05 / 0:42");
    const minus = buttons.find((b) => b.textContent === "−5s")!;
    click(minus);
    expect(container.textContent).toContain("0:00 / 0:42");
  });
});

describe("draft guards", () => {
  it("does nothing on Enter with an empty draft text", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      frame.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    const textInput = q('input[aria-label="Comment text"]') as HTMLInputElement;
    act(() => {
      textInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      textInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(
      container.querySelector('input[aria-label="Comment text"]'),
    ).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("highlighted error event", () => {
  it("highlights the current row in error tone when it is an error", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    click(qAll('[role="tab"]')[3]!); // Network, has the error net event at t=17
    const row = qAll('[class*="eventRow"]').find((r) =>
      r.textContent?.includes("POST /api/checkout 500"),
    )!;
    click(row);
    const highlighted = qAll('[class*="eventRow"]').find((r) =>
      r.textContent?.includes("POST /api/checkout 500"),
    )!;
    expect(highlighted.style.background).toBe("var(--rw-err-soft)");
  });
});

describe("zero duration", () => {
  it("renders the timeline at 0% when duration is 0", () => {
    mount(
      <Viewer
        rewind={zeroDurationRewind()}
        mediaUrl="https://example.com/v.webm"
      />,
    );
    const slider = q('[role="slider"]');
    expect(slider.getAttribute("aria-valuenow")).toBe("0");
  });
});

describe("play/pause", () => {
  it("plays and pauses the media", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const video = q("video") as HTMLVideoElement;
    vi.spyOn(video, "play").mockImplementation(() => {
      act(() => video.dispatchEvent(new Event("play")));
      return Promise.resolve();
    });
    vi.spyOn(video, "pause").mockImplementation(() => {
      act(() => video.dispatchEvent(new Event("pause")));
    });
    const playButton = q('button[aria-label="Play"]');
    click(playButton);
    expect(q('button[aria-label="Pause"]')).toBeTruthy();
    act(() => {
      Object.defineProperty(video, "currentTime", {
        value: 3,
        configurable: true,
      });
      video.dispatchEvent(new Event("timeupdate"));
    });
    expect(container.textContent).toContain("0:03 / 0:42");
    click(q('button[aria-label="Pause"]'));
    expect(q('button[aria-label="Play"]')).toBeTruthy();
  });

  it("pauses the media when seeking or entering comment mode while playing", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const video = q("video") as HTMLVideoElement;
    vi.spyOn(video, "play").mockImplementation(() => {
      act(() => video.dispatchEvent(new Event("play")));
      return Promise.resolve();
    });
    const pause = vi.spyOn(video, "pause").mockImplementation(() => {
      act(() => video.dispatchEvent(new Event("pause")));
    });
    click(q('button[aria-label="Play"]'));
    click(qAll("button").find((b) => b.textContent === "+5s")!);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(q('button[aria-label="Play"]')).toBeTruthy();

    click(q('button[aria-label="Play"]'));
    click(qAll("button").find((b) => b.textContent === "Comment")!);
    expect(pause).toHaveBeenCalledTimes(2);
    expect(q('button[aria-label="Play"]')).toBeTruthy();
  });

  it("disables play and shows Media unavailable on media error", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const video = q("video") as HTMLVideoElement;
    act(() => {
      video.dispatchEvent(new Event("error"));
    });
    expect(container.textContent).toContain("Media unavailable");
    expect(q('button[aria-label="Play"]').hasAttribute("disabled")).toBe(true);
  });

  it("keeps seeking and skips setting currentTime once media has errored", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const video = q("video") as HTMLVideoElement;
    act(() => {
      video.dispatchEvent(new Event("error"));
    });
    const plus = qAll("button").find((b) => b.textContent === "+5s")!;
    click(plus);
    expect(container.textContent).toContain("0:05 / 0:42");
  });

  it("ignores a programmatic click on the disabled play button", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const video = q("video") as HTMLVideoElement;
    act(() => {
      video.dispatchEvent(new Event("error"));
    });
    const playButton = q('button[aria-label="Play"]');
    click(playButton);
    expect(playButton.getAttribute("aria-label")).toBe("Play");
  });
});

describe("timeline markers", () => {
  it("renders two markers at the same second without a duplicate-key warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const rewind = videoRewind();
    rewind.events = [
      { id: "m0", t: 5, kind: "click", text: "Clicked pay", isError: false },
      { id: "m1", t: 5, kind: "err", text: "TypeError", isError: true },
    ] as unknown as RewindDetail["events"];
    mount(<Viewer rewind={rewind} mediaUrl="https://example.com/v.webm" />);
    expect(qAll('[class*="timelineMarker"]')).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
  });
});

describe("screenshot", () => {
  it("renders without a player row", () => {
    mount(
      <Viewer
        rewind={screenshotRewind()}
        mediaUrl="https://example.com/s.png"
      />,
    );
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector('[role="slider"]')).toBeNull();
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("shows Media unavailable when the image fails to load", () => {
    mount(
      <Viewer
        rewind={screenshotRewind()}
        mediaUrl="https://example.com/s.png"
      />,
    );
    const img = q("img");
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    expect(container.textContent).toContain("Media unavailable");
  });
});

describe("comments", () => {
  it("does nothing when clicking the media outside comment mode", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const frame = q('[class*="mediaFrame"]');
    click(frame);
    expect(
      container.querySelector('input[aria-label="Comment text"]'),
    ).toBeNull();
  });

  it("shows the name field when reading the remembered author throws (e.g. storage disabled)", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    click(frame);
    expect(
      container.querySelector('input[aria-label="Your name"]'),
    ).not.toBeNull();
    getItem.mockRestore();
  });

  it("posts a comment and appends it to the list", async () => {
    localStorage.setItem("rewind:comment-author", "Dhiaz Fathra");
    const newComment = {
      id: "c1",
      rewindId: "seed-r1",
      t: 5,
      x: 10,
      y: 20,
      author: "Dhiaz Fathra",
      text: "Hello",
      createdAt: new Date().toISOString(),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(newComment), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      frame.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    const textInput = q('input[aria-label="Comment text"]') as HTMLInputElement;
    type(textInput, "Hello");
    const postButton = qAll("button").find((b) => b.textContent === "Post")!;
    await act(async () => {
      postButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Comment added");
    expect(container.textContent).toContain("Comments 2");
  });

  it("sends one request and disables Post while a click is already in flight", async () => {
    localStorage.setItem("rewind:comment-author", "Dhiaz Fathra");
    let resolveFetch!: (res: Response) => void;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      frame.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    const textInput = q('input[aria-label="Comment text"]') as HTMLInputElement;
    type(textInput, "Hello");
    const postButton = qAll("button").find(
      (b) => b.textContent === "Post",
    )! as HTMLButtonElement;

    // Two quick clicks before the first request resolves.
    click(postButton);
    click(postButton);
    expect(postButton.disabled).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            id: "c1",
            rewindId: "seed-r1",
            t: 5,
            x: 10,
            y: 20,
            author: "Dhiaz Fathra",
            text: "Hello",
            createdAt: new Date().toISOString(),
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Comment added");
  });

  it("shows an error toast and keeps the draft when posting fails", async () => {
    localStorage.setItem("rewind:comment-author", "Dhiaz Fathra");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      frame.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    const textInput = q('input[aria-label="Comment text"]') as HTMLInputElement;
    type(textInput, "Hello");
    const postButton = qAll("button").find((b) => b.textContent === "Post")!;
    await act(async () => {
      postButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Could not post comment");
    expect(q('input[aria-label="Comment text"]')).toBeTruthy();
  });

  it("requires a name before posting when none is remembered", async () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      frame.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    expect(q('input[aria-label="Your name"]')).toBeTruthy();
    const textInput = q('input[aria-label="Comment text"]') as HTMLInputElement;
    type(textInput, "Hello");
    const postButton = qAll("button").find((b) => b.textContent === "Post")!;
    await act(async () => {
      postButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Enter your name to comment");
  });

  it("types a name into the remembered draft's name field and posts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "c1",
          rewindId: "seed-r1",
          t: 5,
          x: 10,
          y: 20,
          author: "Bob",
          text: "Hello",
          createdAt: new Date().toISOString(),
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      frame.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    for (const partial of ["B", "Bo", "Bob"]) {
      type(q('input[aria-label="Your name"]') as HTMLInputElement, partial);
    }
    const textInput = q('input[aria-label="Comment text"]') as HTMLInputElement;
    type(textInput, "Hello");
    const postButton = qAll("button").find((b) => b.textContent === "Post")!;
    await act(async () => {
      postButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Comment added");
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(init!.body as string).author).toBe("Bob");
    expect(localStorage.getItem("rewind:comment-author")).toBe("Bob");
  });

  it("cancels a draft", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      frame.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    const cancel = qAll("button").find((b) => b.textContent === "Cancel")!;
    click(cancel);
    expect(
      container.querySelector('input[aria-label="Comment text"]'),
    ).toBeNull();
  });

  it("opens comment mode from the Comments tab CTA", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    click(qAll('[role="tab"]')[4]!);
    const cta = qAll("button").find((b) =>
      b.textContent?.includes("Click on the video to leave a comment"),
    )!;
    click(cta);
    const commentToggle = qAll("button").find(
      (b) => b.textContent === "Click the video…",
    );
    expect(commentToggle).toBeTruthy();
  });
});

describe("draft keyboard interactions", () => {
  it("posts the draft on Enter in the comment text input", async () => {
    localStorage.setItem("rewind:comment-author", "Dhiaz Fathra");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "c1",
          rewindId: "seed-r1",
          t: 5,
          x: 10,
          y: 20,
          author: "Dhiaz Fathra",
          text: "Hello",
          createdAt: new Date().toISOString(),
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const toggle = qAll("button").find((b) => b.textContent === "Comment")!;
    click(toggle);
    const frame = q('[class*="mediaFrame"]');
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      frame.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    const textInput = q('input[aria-label="Comment text"]') as HTMLInputElement;
    type(textInput, "Hello");
    await act(async () => {
      textInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Comment added");
  });
});

describe("comment marks", () => {
  it("seeks when clicked", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const mark = q('[class*="commentMark"]');
    click(mark);
    expect(container.textContent).toContain("0:18 / 0:42");
  });

  it("seeks on Enter over a comment mark", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const mark = q('[class*="commentMark"]');
    act(() => {
      mark.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(container.textContent).toContain("0:18 / 0:42");
  });

  it("ignores other keys over a comment mark", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const mark = q('[class*="commentMark"]');
    act(() => {
      mark.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    expect(container.textContent).toContain("0:00 / 0:42");
  });
});

describe("status", () => {
  it("PATCHes the new status", async () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const select = q('select[aria-label="Status"]') as HTMLSelectElement;
    await act(async () => {
      select.value = "done";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/rewinds/seed-r1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(select.value).toBe("done");
  });

  it("reverts and toasts on a failed status change", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const select = q('select[aria-label="Status"]') as HTMLSelectElement;
    await act(async () => {
      select.value = "done";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(select.value).toBe("new");
    expect(container.textContent).toContain("Could not update status");
  });

  it("disables the select while a status change is in flight", async () => {
    let finish!: () => void;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(new Response(null, { status: 200 }));
        }),
    );
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const select = q('select[aria-label="Status"]') as HTMLSelectElement;
    await act(async () => {
      select.value = "triage";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(select.disabled).toBe(true);
    await act(async () => {
      finish();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(select.disabled).toBe(false);
    expect(select.value).toBe("triage");
  });
});

describe("copy link", () => {
  it("copies the origin + /r/id and toasts", async () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const button = qAll("button").find((b) => b.textContent === "Copy link")!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${location.origin}/r/seed-r1`,
    );
    expect(container.textContent).toContain("Link copied");
  });

  it("dismisses the toast after its timeout", async () => {
    vi.useFakeTimers();
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const button = qAll("button").find((b) => b.textContent === "Copy link")!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Link copied");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.textContent).not.toContain("Link copied");
    vi.useRealTimers();
  });

  it("clears the pending toast timer when a second toast arrives quickly", async () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const button = qAll("button").find((b) => b.textContent === "Copy link")!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Link copied");
  });

  it("toasts an error when the clipboard write fails", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const button = qAll("button").find((b) => b.textContent === "Copy link")!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Could not copy link");
  });
});

describe("summary tab", () => {
  function similar(): import("@/lib/rewinds").SimilarRewind[] {
    return [
      {
        id: "seed-r2",
        title: "Checkout 500 on mobile",
        reporterName: "Leo Park",
        createdAt: new Date(Date.now() - 10 * 60_000),
      },
    ];
  }

  it("omits the AI summary block when AI_SUMMARY is off", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    expect(container.textContent).not.toContain("AI summary");
  });

  it("shows the AI summary block when AI_SUMMARY is on", () => {
    mockFlags.AI_SUMMARY = true;
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    expect(container.textContent).toContain("AI summary");
    expect(container.textContent).toContain("Likely root cause");
  });

  it("shows the no-error copy and omits root cause when nothing errored", () => {
    mockFlags.AI_SUMMARY = true;
    mount(
      <Viewer
        rewind={{
          ...videoRewind(),
          errorSignature: null,
          events: videoRewind().events.map((e) => ({ ...e, isError: false })),
        }}
        mediaUrl="https://example.com/v.webm"
      />,
    );
    expect(container.textContent).toContain(
      "No error was recorded in this Rewind.",
    );
    expect(container.textContent).not.toContain("Likely root cause");
  });

  it("names the error signature in the AI summary when one is set", () => {
    mockFlags.AI_SUMMARY = true;
    mount(
      <Viewer
        rewind={{ ...videoRewind(), errorSignature: "sig-1" }}
        mediaUrl="https://example.com/v.webm"
      />,
    );
    expect(container.textContent).toContain(
      'This Rewind\'s errors match signature "sig-1".',
    );
  });

  it("describes a screenshot Rewind instead of a duration", () => {
    mockFlags.AI_SUMMARY = true;
    mount(
      <Viewer rewind={screenshotRewind()} mediaUrl="https://example.com/s.png" />,
    );
    expect(container.textContent).toContain("Recorded as a screenshot.");
  });

  it("hides the similar-error list and merge button with no similar Rewinds", () => {
    mount(
      <Viewer
        rewind={{ ...videoRewind(), errorSignature: "sig-1" }}
        mediaUrl="https://example.com/v.webm"
      />,
    );
    expect(container.textContent).not.toContain("share this error");
  });

  it("lists Rewinds sharing the same errorSignature", () => {
    mount(
      <Viewer
        rewind={{ ...videoRewind(), errorSignature: "sig-1" }}
        mediaUrl="https://example.com/v.webm"
        similarRewinds={similar()}
      />,
    );
    expect(container.textContent).toContain("2 Rewinds share this error");
    expect(container.textContent).toContain("Checkout 500 on mobile");
    const link = qAll("a").find(
      (a) => a.getAttribute("href") === "/r/seed-r2",
    );
    expect(link).toBeTruthy();
  });

  it("omits Send to Linear when INTEGRATIONS is off", () => {
    mount(
      <Viewer
        rewind={videoRewind()}
        mediaUrl="https://example.com/v.webm"
        similarRewinds={[]}
      />,
    );
    expect(
      qAll("button").find((b) => b.textContent === "Send to Linear"),
    ).toBeUndefined();
  });

  it("sending to Linear shows a toast", () => {
    mockFlags.INTEGRATIONS = true;
    mount(
      <Viewer
        rewind={videoRewind()}
        mediaUrl="https://example.com/v.webm"
        similarRewinds={[]}
      />,
    );
    const button = qAll("button").find(
      (b) => b.textContent === "Send to Linear",
    )!;
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Sent to Linear");
  });

  it("omits the merge button when SIMILAR_MERGE is off", () => {
    mount(
      <Viewer
        rewind={{ ...videoRewind(), errorSignature: "sig-1" }}
        mediaUrl="https://example.com/v.webm"
        similarRewinds={similar()}
      />,
    );
    expect(
      qAll("button").find((b) => b.textContent === "Merge into one issue"),
    ).toBeUndefined();
  });

  it("merging shows a toast and does not call the network", () => {
    mockFlags.SIMILAR_MERGE = true;
    mount(
      <Viewer
        rewind={{ ...videoRewind(), errorSignature: "sig-1" }}
        mediaUrl="https://example.com/v.webm"
        similarRewinds={similar()}
      />,
    );
    const button = qAll("button").find(
      (b) => b.textContent === "Merge into one issue",
    )!;
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain(
      "Merged 2 Rewinds into one issue",
    );
  });
});

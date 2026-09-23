// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RewindDetail } from "@/lib/rewinds";
import { Viewer } from "./viewer";

function videoRewind(): RewindDetail {
  return {
    id: "seed-r1",
    title: "Checkout fails after applying coupon",
    url: "https://shop.acme.co/cart",
    reporterName: "Maya Chen",
    status: "new",
    kind: "video",
    mediaKey: "rewinds/seed-r1.webm",
    durationSeconds: 42,
    folderId: null,
    recordingLinkId: null,
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
  it("switches between Info, Events, Console, Network and Comments", () => {
    mount(
      <Viewer rewind={videoRewind()} mediaUrl="https://example.com/v.webm" />,
    );
    const tabs = qAll('[role="tab"]');
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Info",
      "Events",
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

  it("seeks from a step in Info", () => {
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
    const nameInput = q('input[aria-label="Your name"]') as HTMLInputElement;
    type(nameInput, "Bob");
    const textInput = q('input[aria-label="Comment text"]') as HTMLInputElement;
    type(textInput, "Hello");
    const postButton = qAll("button").find((b) => b.textContent === "Post")!;
    await act(async () => {
      postButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Comment added");
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

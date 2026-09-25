// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { Recorder } = await import("./recorder");

let container: HTMLDivElement;
let root: Root;

function mount(el: React.ReactElement) {
  act(() => {
    root.render(el);
  });
}

function buttonByText(text: string): HTMLElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!btn) throw new Error(`no button with text: ${text}`);
  return btn;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const instances: FakeMediaRecorder[] = [];

class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: unknown,
    public opts: unknown,
  ) {
    instances.push(this);
  }
  start = vi.fn();
  stop = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(["x"]) });
    this.onstop?.();
  });
}

let track: { stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
let getDisplayMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  track = { stop: vi.fn(), onended: null };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  getDisplayMedia = vi.fn().mockResolvedValue(stream);
  instances.length = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getDisplayMedia },
    configurable: true,
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows the ready-to-record card", async () => {
  mount(<Recorder linkId="l1" linkName="Beta testers" />);
  await flush();
  expect(container.textContent).toContain("Ready to record?");
  expect(buttonByText("Start recording")).toBeTruthy();
});

it("shows a permission-denied error with Retry when getDisplayMedia rejects", async () => {
  getDisplayMedia.mockRejectedValue(new Error("denied"));
  mount(<Recorder linkId="l1" linkName="Beta testers" />);
  await flush();
  click(buttonByText("Start recording"));
  await flush();
  expect(container.textContent).toContain(
    "Screen recording permission was denied.",
  );
  expect(buttonByText("Retry")).toBeTruthy();
});

it("records, uploads, and shows a thank-you on success", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://minio/put", key: "rewinds/a.webm" }), {
        status: 200,
      }),
    )
    .mockResolvedValueOnce(new Response("", { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "r1" }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);

  mount(<Recorder linkId="l1" linkName="Beta testers" />);
  await flush();
  click(buttonByText("Start recording"));
  await flush();
  expect(buttonByText("Stop recording")).toBeTruthy();

  click(buttonByText("Stop recording"));
  await flush();

  expect(track.stop).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/uploads",
    expect.objectContaining({ method: "POST" }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "https://minio/put",
    expect.objectContaining({ method: "PUT" }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    "/api/rec/l1/rewinds",
    expect.objectContaining({ method: "POST" }),
  );
  expect(container.textContent).toContain("Thanks!");
  expect(container.textContent).toContain("Beta testers");
});

it("stops recording when the browser's own Stop sharing control ends the track", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
  );
  mount(<Recorder linkId="l1" linkName="Beta testers" />);
  await flush();
  click(buttonByText("Start recording"));
  await flush();
  act(() => {
    track.onended?.();
  });
  await flush();
  expect(container.textContent).not.toContain("Stop recording");
});

it("drops zero-size chunks from ondataavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
  );
  mount(<Recorder linkId="l1" linkName="Beta testers" />);
  await flush();
  click(buttonByText("Start recording"));
  await flush();
  act(() => {
    instances[0]!.ondataavailable?.({ data: new Blob([]) });
  });
  click(buttonByText("Stop recording"));
  await flush();
  expect(container.textContent).toContain("Thanks!");
});

describe("upload failures", () => {
  it("shows an error with Retry when getting the upload url fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    mount(<Recorder linkId="l1" linkName="Beta testers" />);
    await flush();
    click(buttonByText("Start recording"));
    await flush();
    click(buttonByText("Stop recording"));
    await flush();
    expect(container.textContent).toContain("Upload failed.");
    expect(buttonByText("Retry")).toBeTruthy();
  });

  it("shows an error with Retry when the PUT to storage fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ url: "https://minio/put", key: "rewinds/a.webm" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(new Response("", { status: 500 })),
    );
    mount(<Recorder linkId="l1" linkName="Beta testers" />);
    await flush();
    click(buttonByText("Start recording"));
    await flush();
    click(buttonByText("Stop recording"));
    await flush();
    expect(container.textContent).toContain("Upload failed.");
  });

  it("shows an error with Retry when saving the rewind fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ url: "https://minio/put", key: "rewinds/a.webm" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(new Response("", { status: 200 }))
        .mockResolvedValueOnce(new Response("", { status: 400 })),
    );
    mount(<Recorder linkId="l1" linkName="Beta testers" />);
    await flush();
    click(buttonByText("Start recording"));
    await flush();
    click(buttonByText("Stop recording"));
    await flush();
    expect(container.textContent).toContain("Upload failed.");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const conversionExecute = vi.fn(async () => undefined);
const conversionInit = vi.fn(async () => ({ execute: conversionExecute }));
const computeDuration = vi.fn(async () => 42);
const canEncodeMock = vi.fn(async () => true);
const outputAddVideoTrack = vi.fn();
const outputStart = vi.fn(async () => undefined);
const outputFinalize = vi.fn(async () => undefined);
const canvasSourceAdd = vi.fn(async () => undefined);

class MockBlobSource {
  constructor(public blob: Blob) {}
}
class MockBufferTarget {
  buffer: ArrayBuffer = new ArrayBuffer(8);
}
class MockInput {
  computeDuration = computeDuration;
  constructor(public opts: unknown) {}
}
class MockOutput {
  format: unknown;
  target: unknown;
  addVideoTrack = outputAddVideoTrack;
  start = outputStart;
  finalize = outputFinalize;
  constructor(opts: { format: unknown; target: unknown }) {
    this.format = opts.format;
    this.target = opts.target;
  }
}
class MockWebMOutputFormat {}
class MockCanvasSource {
  add = canvasSourceAdd;
  constructor(
    public canvas: unknown,
    public config: unknown,
  ) {}
}

vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  BlobSource: MockBlobSource,
  BufferTarget: MockBufferTarget,
  CanvasSource: MockCanvasSource,
  Conversion: { init: conversionInit },
  Input: MockInput,
  Output: MockOutput,
  QUALITY_MEDIUM: "medium",
  WebMOutputFormat: MockWebMOutputFormat,
  canEncode: canEncodeMock,
}));

const {
  cropRect,
  cropTrack,
  encodeFrames,
  exportImage,
  openDisplayStream,
  openMic,
  openTabStream,
  remux,
  startRecorder,
} = await import("../lib/media");

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("openTabStream", () => {
  it("requests a tab-source getUserMedia stream", async () => {
    const getUserMedia = vi.fn(async () => "stream");
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    await openTabStream("abc");
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "abc" },
      },
    });
  });
});

describe("openDisplayStream", () => {
  it("requests a monitor display stream with no audio", async () => {
    const getDisplayMedia = vi.fn(async () => "stream");
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
    await openDisplayStream();
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: { displaySurface: "monitor" },
      audio: false,
    });
  });
});

describe("openMic", () => {
  it("uses audio: true for the default device", async () => {
    const getUserMedia = vi.fn(async () => "stream");
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    await openMic("default");
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("uses an exact deviceId constraint otherwise", async () => {
    const getUserMedia = vi.fn(async () => "stream");
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    await openMic("mic-1");
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "mic-1" } },
    });
  });
});

describe("cropRect", () => {
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
    viewportWidth: 100,
  });

  it("scales by frameWidth / viewportWidth", () => {
    expect(cropRect(rect(10, 10, 20, 20), 200, 200)).toEqual({
      x: 20,
      y: 20,
      width: 40,
      height: 40,
    });
  });

  it("rounds odd pixel values down to even", () => {
    expect(cropRect(rect(1, 1, 3, 3), 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
  });

  it("clamps a rect that starts outside the frame", () => {
    expect(cropRect(rect(-50, -50, 10, 10), 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
  });

  it("clamps a rect that overruns the frame on the right/bottom", () => {
    expect(cropRect(rect(90, 90, 50, 50), 100, 100)).toEqual({
      x: 90,
      y: 90,
      width: 10,
      height: 10,
    });
  });

  it("never produces a negative width or height", () => {
    expect(cropRect(rect(100, 100, 10, 10), 100, 100)).toEqual({
      x: 98,
      y: 98,
      width: 2,
      height: 2,
    });
  });
});

class MockSourceFrame {
  closed = false;
  constructor(
    public displayWidth: number,
    public displayHeight: number,
  ) {}
  close(): void {
    this.closed = true;
  }
}

class MockVideoFrame {
  closed = false;
  constructor(
    public source: unknown,
    public init?: { visibleRect?: unknown },
  ) {}
  close(): void {
    this.closed = true;
  }
}

describe("cropTrack", () => {
  let written: MockVideoFrame[];
  let closeCalls: string[];

  beforeEach(() => {
    written = [];
    closeCalls = [];

    class MockProcessor {
      readable: ReadableStream<MockSourceFrame>;
      constructor(public init: { track: unknown }) {
        this.readable = new ReadableStream({
          start(controller) {
            controller.enqueue(new MockSourceFrame(100, 50));
            controller.enqueue(new MockSourceFrame(100, 50));
            controller.close();
          },
        });
      }
    }

    class MockGenerator extends EventTarget {
      writable: WritableStream<MockVideoFrame>;
      constructor(public init: { kind: string }) {
        super();
        this.writable = new WritableStream({
          write(frame) {
            written.push(frame);
          },
        });
      }
      stop(): void {
        closeCalls.push("generator");
      }
    }

    vi.stubGlobal("MediaStreamTrackProcessor", MockProcessor);
    vi.stubGlobal("MediaStreamTrackGenerator", MockGenerator);
    vi.stubGlobal("VideoFrame", MockVideoFrame);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("crops every frame and stops the source track when the generator is stopped", async () => {
    const track = {
      stop: vi.fn(() => closeCalls.push("track")),
    } as unknown as MediaStreamVideoTrack;

    const generator = cropTrack(track, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      viewportWidth: 100,
    });
    await tick();
    await tick();

    expect(written).toHaveLength(2);
    expect(written[0]).toBeInstanceOf(MockVideoFrame);

    // `MediaStreamTrack.stop()` never fires `ended`, so `cropTrack` must
    // stop the source itself when its caller stops the generator track.
    generator.stop();
    expect(closeCalls).toContain("generator");
    expect(closeCalls).toContain("track");
  });
});

describe("startRecorder", () => {
  let instances: FakeRecorder[];

  class FakeRecorder {
    static supported = true;
    static isTypeSupported = vi.fn(
      (type: string) => type.includes("vp9") && FakeRecorder.supported,
    );
    mimeType: string;
    state: "inactive" | "recording" = "recording";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    pause = vi.fn();
    resume = vi.fn();
    start = vi.fn();
    stop = vi.fn(() => {
      this.ondataavailable?.({ data: new Blob(["x"], { type: "text/plain" }) });
      this.ondataavailable?.({ data: new Blob([], { type: "text/plain" }) });
      this.state = "inactive";
      this.onstop?.();
    });
    constructor(
      public stream: unknown,
      opts: { mimeType: string },
    ) {
      this.mimeType = opts.mimeType;
      instances.push(this);
    }
  }

  beforeEach(() => {
    instances = [];
    FakeRecorder.supported = true;
    vi.stubGlobal("MediaRecorder", FakeRecorder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers vp9/opus when supported, times-liced at 1s", () => {
    startRecorder({} as MediaStream);
    expect(instances[0]!.mimeType).toBe("video/webm;codecs=vp9,opus");
    expect(instances[0]!.start).toHaveBeenCalledWith(1000);
  });

  it("falls back to plain video/webm when vp9 isn't supported", () => {
    FakeRecorder.supported = false;
    startRecorder({} as MediaStream);
    expect(instances[0]!.mimeType).toBe("video/webm");
  });

  it("pause/resume delegate to the recorder", () => {
    const recorder = startRecorder({} as MediaStream);
    recorder.pause();
    recorder.resume();
    expect(instances[0]!.pause).toHaveBeenCalled();
    expect(instances[0]!.resume).toHaveBeenCalled();
  });

  it("stop resolves a Blob typed exactly video/webm, ignoring empty chunks", async () => {
    const recorder = startRecorder({} as MediaStream);
    const blob = await recorder.stop();
    expect(blob.type).toBe("video/webm");
  });

  it("stop still resolves when the recorder already went inactive (all tracks ended)", async () => {
    const recorder = startRecorder({} as MediaStream);
    // Simulate the browser auto-stopping the recorder (e.g. "Stop sharing")
    // before our code ever calls stop() itself.
    instances[0]!.ondataavailable?.({
      data: new Blob(["x"], { type: "text/plain" }),
    });
    instances[0]!.state = "inactive";
    instances[0]!.onstop?.();

    const blob = await recorder.stop();
    expect(blob.type).toBe("video/webm");
    expect(instances[0]!.stop).not.toHaveBeenCalled();
  });
});

describe("remux", () => {
  it("remuxes without a trim, using the input's computed duration", async () => {
    const { blob, durationSeconds } = await remux(
      new Blob(["x"], { type: "video/webm" }),
    );
    expect(blob.type).toBe("video/webm");
    expect(durationSeconds).toBe(42);
  });

  it("uses the trim's span as the duration when trimming", async () => {
    const { durationSeconds } = await remux(new Blob(["x"]), {
      start: 2,
      end: 7,
    });
    expect(durationSeconds).toBe(5);
  });
});

class FakeCanvasContext {
  calls: string[] = [];
  strokeStyle = "";
  fillStyle = "";
  lineWidth = 0;
  font = "";
  textBaseline = "";
  drawImage(): void {
    this.calls.push("drawImage");
  }
  beginPath(): void {
    this.calls.push("beginPath");
  }
  roundRect(): void {
    this.calls.push("roundRect");
  }
  stroke(): void {
    this.calls.push("stroke");
  }
  fill(): void {
    this.calls.push("fill");
  }
  fillText(): void {
    this.calls.push("fillText");
  }
  measureText(): { width: number } {
    return { width: 40 };
  }
}

function stubOffscreenCanvas(): FakeCanvasContext {
  const ctx = new FakeCanvasContext();
  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext(): FakeCanvasContext {
      return ctx;
    }
    convertToBlob(options: { type: string }): Promise<Blob> {
      return Promise.resolve(new Blob([], { type: options.type }));
    }
  }
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  return ctx;
}

describe("encodeFrames", () => {
  beforeEach(() => {
    stubOffscreenCanvas();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes each frame held until the next, the last held 1s, with vp9 when supported", async () => {
    canEncodeMock.mockResolvedValueOnce(true);
    const { durationSeconds } = await encodeFrames([
      { at: 1000, blob: new Blob() },
      { at: 3000, blob: new Blob() },
    ]);
    expect(durationSeconds).toBe((3000 - 1000) / 1000 + 1);
    expect(canvasSourceAdd).toHaveBeenNthCalledWith(1, 0, 2);
    expect(canvasSourceAdd).toHaveBeenNthCalledWith(2, 2, 1);
  });

  it("falls back to vp8 when vp9 can't be encoded", async () => {
    canEncodeMock.mockResolvedValueOnce(false);
    await encodeFrames([{ at: 0, blob: new Blob() }]);
    expect(canEncodeMock).toHaveBeenCalledWith("vp9");
  });
});

describe("exportImage", () => {
  beforeEach(() => {
    stubOffscreenCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws a box with no label using naturalWidth/Height (HTMLImageElement)", async () => {
    const img = { naturalWidth: 200, naturalHeight: 100 } as HTMLImageElement;
    const blob = await exportImage(img, [
      { x: 1, y: 1, width: 10, height: 10 },
    ]);
    expect(blob.type).toBe("image/png");
  });

  it("draws a labeled box using width/height (ImageBitmap)", async () => {
    const img = { width: 50, height: 50 } as unknown as ImageBitmap;
    const blob = await exportImage(img, [
      { x: 1, y: 1, width: 10, height: 10, label: "Total is wrong here" },
    ]);
    expect(blob.type).toBe("image/png");
  });
});

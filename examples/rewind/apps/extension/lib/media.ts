import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  Input,
  Output,
  QUALITY_MEDIUM,
  WebMOutputFormat,
  canEncode,
} from "mediabunny";
import type { Rect } from "./messages";

// DOM lib doesn't ship these WebCodecs-adjacent breakout APIs yet.
export type MediaStreamTrackProcessorInit = { track: MediaStreamVideoTrack };
export declare class MediaStreamTrackProcessor {
  constructor(init: MediaStreamTrackProcessorInit);
  readonly readable: ReadableStream<VideoFrame>;
}
export type MediaStreamTrackGeneratorInit = { kind: "video" };
export declare class MediaStreamTrackGenerator extends MediaStreamTrack {
  constructor(init: MediaStreamTrackGeneratorInit);
  readonly writable: WritableStream<VideoFrame>;
}
export type VideoFrameInit = { visibleRect?: DOMRectInit };
export declare class VideoFrame {
  constructor(image: CanvasImageSource | VideoFrame, init?: VideoFrameInit);
  readonly displayWidth: number;
  readonly displayHeight: number;
  close(): void;
}

/** A tab's captured video via `chrome.tabCapture`'s stream id. */
export function openTabStream(streamId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
      // The `mandatory` bag above is a Chrome-only, undocumented extension
      // of the getUserMedia constraints shape; the DOM lib has no type for it.
    } as unknown as MediaTrackConstraints,
  });
}

/** The user's whole desktop/window/tab, chosen via the browser's picker. */
export function openDisplayStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor" },
    audio: false,
  });
}

/** The chosen microphone, or the system default when `deviceId` is `"default"`. */
export function openMic(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: deviceId === "default" ? true : { deviceId: { exact: deviceId } },
  });
}

function toEven(n: number): number {
  return Math.floor(n / 2) * 2;
}

/** Scales a CSS-px viewport rect to even-aligned frame pixels, clamped inside the frame. */
export function cropRect(
  rect: Rect,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scaleX = frameWidth / rect.viewportWidth;
  const scaleY = scaleX;
  const x = Math.min(
    Math.max(toEven(Math.floor(rect.x * scaleX)), 0),
    frameWidth - 2,
  );
  const y = Math.min(
    Math.max(toEven(Math.floor(rect.y * scaleY)), 0),
    frameHeight - 2,
  );
  const width = Math.min(
    toEven(Math.floor(rect.width * scaleX)),
    toEven(frameWidth - x),
  );
  const height = Math.min(
    toEven(Math.floor(rect.height * scaleY)),
    toEven(frameHeight - y),
  );
  return { x, y, width: Math.max(width, 0), height: Math.max(height, 0) };
}

/** Crops every frame of a video track to `rect`, returning the cropped track. */
export function cropTrack(
  track: MediaStreamVideoTrack,
  rect: Rect,
): MediaStreamVideoTrack {
  const processor = new MediaStreamTrackProcessor({ track });
  const generator = new MediaStreamTrackGenerator({ kind: "video" });
  const reader = processor.readable.getReader();
  const writer = generator.writable.getWriter();

  void (async () => {
    for (;;) {
      const { done, value: frame } = await reader.read();
      if (done) break;
      const visibleRect = cropRect(
        rect,
        frame.displayWidth,
        frame.displayHeight,
      );
      const cropped = new VideoFrame(frame, { visibleRect });
      frame.close();
      await writer.write(cropped as unknown as VideoFrame & VideoFrame);
    }
    await writer.close();
  })();

  generator.addEventListener("ended", () => track.stop());

  return generator as unknown as MediaStreamVideoTrack;
}

const WEBM_TYPE = "video/webm";
const PREFERRED_MIME = "video/webm;codecs=vp9,opus";
const TIMESLICE_MS = 1000;

export type Recorder = {
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob>;
};

/** Records `stream` to a `video/webm` Blob, vp9/opus when supported. */
export function startRecorder(stream: MediaStream): Recorder {
  const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME)
    ? PREFERRED_MIME
    : WEBM_TYPE;
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(TIMESLICE_MS);

  return {
    pause: () => recorder.pause(),
    resume: () => recorder.resume(),
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: WEBM_TYPE }));
        };
        recorder.stop();
      }),
  };
}

export type Trim = { start: number; end: number };

/** Remuxes a recorded WebM into a seekable one, applying an optional trim. */
export async function remux(
  blob: Blob,
  trim?: Trim,
): Promise<{ blob: Blob; durationSeconds: number }> {
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const conversion = await Conversion.init({ input, output, trim });
  await conversion.execute();
  const durationSeconds = await input.computeDuration();
  return {
    blob: new Blob([target.buffer!], { type: WEBM_TYPE }),
    durationSeconds: trim ? trim.end - trim.start : durationSeconds,
  };
}

const HOLD_LAST_FRAME_SECONDS = 1;

/** Encodes still frames (e.g. instant replay snapshots) into a `video/webm`. */
export async function encodeFrames(
  frames: { at: number; blob: Blob }[],
): Promise<{ blob: Blob; durationSeconds: number }> {
  const first = frames[0]!.at;
  const last = frames[frames.length - 1]!.at;
  const durationSeconds = (last - first) / 1000 + HOLD_LAST_FRAME_SECONDS;

  const bitmaps = await Promise.all(
    frames.map((f) => createImageBitmap(f.blob)),
  );
  const { width, height } = bitmaps[0]!;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;

  const codec = (await canEncode("vp9")) ? "vp9" : "vp8";
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_MEDIUM });
  output.addVideoTrack(source);
  await output.start();

  for (let i = 0; i < frames.length; i++) {
    const bitmap = bitmaps[i]!;
    ctx.drawImage(bitmap, 0, 0);
    const timestamp = (frames[i]!.at - first) / 1000;
    const duration =
      i + 1 < frames.length
        ? (frames[i + 1]!.at - frames[i]!.at) / 1000
        : HOLD_LAST_FRAME_SECONDS;
    await source.add(timestamp, duration);
    bitmap.close();
  }

  await output.finalize();
  return {
    blob: new Blob([target.buffer!], { type: WEBM_TYPE }),
    durationSeconds,
  };
}

const BOX_COLOR = "#e35e5e";
const BOX_LINE_WIDTH = 3;
const BOX_RADIUS = 8;
const LABEL_FONT = "600 12px sans-serif";
const LABEL_PADDING = 6;
const LABEL_HEIGHT = 24;

function roundRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

/** Draws boxes (and optional labels) onto `img` at natural size, as a PNG Blob. */
export async function exportImage(
  img: HTMLImageElement | ImageBitmap,
  boxes: {
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
  }[],
): Promise<Blob> {
  const width = "naturalWidth" in img ? img.naturalWidth : img.width;
  const height = "naturalHeight" in img ? img.naturalHeight : img.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);

  for (const box of boxes) {
    ctx.strokeStyle = BOX_COLOR;
    ctx.lineWidth = BOX_LINE_WIDTH;
    roundRect(ctx, box.x, box.y, box.width, box.height, BOX_RADIUS);
    ctx.stroke();

    if (box.label) {
      ctx.font = LABEL_FONT;
      const textWidth = ctx.measureText(box.label).width;
      const pillWidth = textWidth + LABEL_PADDING * 2;
      const pillX = box.x;
      const pillY = box.y + box.height + 6;
      ctx.fillStyle = BOX_COLOR;
      roundRect(ctx, pillX, pillY, pillWidth, LABEL_HEIGHT, LABEL_HEIGHT / 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(box.label, pillX + LABEL_PADDING, pillY + LABEL_HEIGHT / 2);
    }
  }

  return canvas.convertToBlob({ type: "image/png" });
}

// Shared capture schemas: the single source of truth for every request
// body the web app and extension both send/receive.
import { customAlphabet } from "nanoid";
import { z } from "zod";

const nanoidAlphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

export const newId = customAlphabet(nanoidAlphabet, 21);

export const rewindStatus = z.enum(["new", "triage", "progress", "done"]);
export const rewindKind = z.enum(["video", "screenshot"]);
export const eventKind = z.enum([
  "nav",
  "click",
  "input",
  "net",
  "log",
  "warn",
  "err",
]);

// `rewinds/<21-char nanoid>.<ext>` — the only shape a mediaKey may take.
export const mediaKeyPattern =
  /^rewinds\/[A-Za-z0-9_-]{21}\.(webm|mp4|png|jpg)$/;

export const contentTypeToExtension = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;

const contentTypes = Object.keys(
  contentTypeToExtension,
) as (keyof typeof contentTypeToExtension)[];

export const uploadRequest = z.object({
  contentType: z.enum(contentTypes as [string, ...string[]]),
});

export const event = z.object({
  t: z.number().min(0),
  kind: eventKind,
  text: z.string().max(10_000),
  isError: z.boolean().default(false),
});

export const createRewind = z
  .object({
    title: z.string().min(1).max(200),
    url: z.url({ protocol: /^https?$/ }).max(2048),
    reporterName: z.string().min(1).max(100),
    status: rewindStatus.default("new"),
    kind: rewindKind,
    mediaKey: z.string().regex(mediaKeyPattern),
    durationSeconds: z.number().gt(0).nullable().optional(),
    folderId: z.string().nullable().optional(),
    recordingLinkId: z.string().nullable().optional(),
    events: z.array(event).max(10_000).default([]),
  })
  .refine(
    (v) =>
      v.kind === "video"
        ? v.durationSeconds != null
        : v.durationSeconds == null,
    {
      message:
        "durationSeconds is required for a video and forbidden for a screenshot",
      path: ["durationSeconds"],
    },
  );

export const updateRewind = z
  .object({
    title: z.string().min(1).max(200).optional(),
    status: rewindStatus.optional(),
    folderId: z.string().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  });

export const createComment = z.object({
  t: z.number().min(0),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  author: z.string().min(1).max(100),
  text: z.string().min(1).max(5_000),
});

export const createFolder = z.object({ name: z.string().min(1).max(100) });
export const updateFolder = z.object({ name: z.string().min(1).max(100) });
export const createRecordingLink = z.object({
  name: z.string().min(1).max(100),
});

export type RewindStatus = z.infer<typeof rewindStatus>;
export type RewindKind = z.infer<typeof rewindKind>;
export type EventKind = z.infer<typeof eventKind>;
export type UploadRequest = z.infer<typeof uploadRequest>;
export type Event = z.infer<typeof event>;
export type CreateRewind = z.infer<typeof createRewind>;
export type UpdateRewind = z.infer<typeof updateRewind>;
export type CreateComment = z.infer<typeof createComment>;
export type CreateFolder = z.infer<typeof createFolder>;
export type UpdateFolder = z.infer<typeof updateFolder>;
export type CreateRecordingLink = z.infer<typeof createRecordingLink>;

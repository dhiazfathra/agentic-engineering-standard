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

// Avatars and workspace logos: a smaller image-only set, gif included.
export const contentTypeToImageExtension = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
} as const;

const imageContentTypes = Object.keys(
  contentTypeToImageExtension,
) as (keyof typeof contentTypeToImageExtension)[];

export const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024;

export const imageUploadRequest = z.object({
  contentType: z.enum(imageContentTypes as [string, ...string[]]),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_UPLOAD_BYTES),
});

export const avatarKeyPattern = /^avatars\/[A-Za-z0-9_-]{21}\.(png|jpg|gif)$/;
export const logoKeyPattern = /^logos\/[A-Za-z0-9_-]{21}\.(png|jpg|gif)$/;

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

// Accounts and workspaces.

export const userRole = z.enum([
  "Engineering",
  "Product",
  "Design",
  "QA",
  "Support",
]);
export const membershipRole = z.enum(["Admin", "Creator", "Viewer"]);
export const defaultLinkAccess = z.enum(["anyone", "members", "invited"]);

export const signupRequest = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export const loginRequest = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const updateWorkspace = z
  .object({
    name: z.string().min(1).max(200).optional(),
    logoKey: z.string().regex(logoKeyPattern).nullable().optional(),
    inviteLinkEnabled: z.boolean().optional(),
    restrictInvites: z.boolean().optional(),
    defaultLinkAccess: defaultLinkAccess.optional(),
    aiEnabled: z.boolean().optional(),
    ssoEnabled: z.boolean().optional(),
    autoDelete: z.boolean().optional(),
    auditLogs: z.boolean().optional(),
    groupDuplicates: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  });

export const createWorkspace = z.object({ name: z.string().min(1).max(200) });
export const switchWorkspace = z.object({ id: z.string().min(1) });
export const joinWorkspace = z.object({
  inviteUrl: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
});

export const updateMember = z
  .object({ role: membershipRole })
  .strict();

export const createInvites = z.object({
  emails: z.array(z.email()).min(1).max(50),
  role: membershipRole.default("Viewer"),
});

export const updateMe = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    role: userRole.optional(),
    theme: z.enum(["light", "dark"]).optional(),
    notifyN1: z.boolean().optional(),
    notifyN2: z.boolean().optional(),
    notifyN3: z.boolean().optional(),
    notifyN4: z.boolean().optional(),
    notifyN5: z.boolean().optional(),
    avatarKey: z.string().regex(avatarKeyPattern).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  });

export const createToken = z.object({ name: z.string().min(1).max(100) });

export type RewindStatus = z.infer<typeof rewindStatus>;
export type RewindKind = z.infer<typeof rewindKind>;
export type EventKind = z.infer<typeof eventKind>;
export type UploadRequest = z.infer<typeof uploadRequest>;
export type ImageUploadRequest = z.infer<typeof imageUploadRequest>;
export type Event = z.infer<typeof event>;
export type CreateRewind = z.infer<typeof createRewind>;
export type UpdateRewind = z.infer<typeof updateRewind>;
export type CreateComment = z.infer<typeof createComment>;
export type CreateFolder = z.infer<typeof createFolder>;
export type UpdateFolder = z.infer<typeof updateFolder>;
export type CreateRecordingLink = z.infer<typeof createRecordingLink>;
export type SignupRequest = z.infer<typeof signupRequest>;
export type LoginRequest = z.infer<typeof loginRequest>;
export type UpdateWorkspace = z.infer<typeof updateWorkspace>;
export type CreateWorkspace = z.infer<typeof createWorkspace>;
export type SwitchWorkspace = z.infer<typeof switchWorkspace>;
export type JoinWorkspace = z.infer<typeof joinWorkspace>;
export type UpdateMember = z.infer<typeof updateMember>;
export type CreateInvites = z.infer<typeof createInvites>;
export type UpdateMe = z.infer<typeof updateMe>;
export type CreateToken = z.infer<typeof createToken>;

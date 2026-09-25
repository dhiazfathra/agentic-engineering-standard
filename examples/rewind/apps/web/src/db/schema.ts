import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  type EventKind,
  eventKind,
  newId,
  type RewindKind,
  rewindKind,
  type RewindStatus,
  rewindStatus,
} from "@rewind/schema";

// Fixed id for the workspace the migration assigns pre-existing rows to.
// Referenced by the migration's backfill and by the schema's column default,
// which only ever matters during that same migration (every route sets
// workspaceId explicitly on insert).
export const DEFAULT_WORKSPACE_ID = "default-workspace";

export const userRole = ["Engineering", "Product", "Design", "QA", "Support"] as const;
export type UserRole = (typeof userRole)[number];

export const membershipRole = ["Admin", "Creator", "Viewer"] as const;
export type MembershipRole = (typeof membershipRole)[number];

export const defaultLinkAccess = ["anyone", "members", "invited"] as const;
export type DefaultLinkAccess = (typeof defaultLinkAccess)[number];

export const users = sqliteTable("users", {
  id: text().primaryKey().$defaultFn(newId),
  email: text().notNull(),
  passwordHash: text().notNull(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  role: text({ enum: userRole }).notNull().default("Engineering"),
  avatarKey: text(),
  theme: text({ enum: ["light", "dark"] }).notNull().default("light"),
  notifyN1: integer({ mode: "boolean" }).notNull().default(true),
  notifyN2: integer({ mode: "boolean" }).notNull().default(true),
  notifyN3: integer({ mode: "boolean" }).notNull().default(true),
  notifyN4: integer({ mode: "boolean" }).notNull().default(true),
  notifyN5: integer({ mode: "boolean" }).notNull().default(true),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const workspaces = sqliteTable("workspaces", {
  id: text().primaryKey().$defaultFn(newId),
  name: text().notNull(),
  logoKey: text(),
  inviteCode: text().notNull(),
  inviteLinkEnabled: integer({ mode: "boolean" }).notNull().default(true),
  restrictInvites: integer({ mode: "boolean" }).notNull().default(false),
  defaultLinkAccess: text({ enum: defaultLinkAccess })
    .notNull()
    .default("members"),
  aiEnabled: integer({ mode: "boolean" }).notNull().default(false),
  ssoEnabled: integer({ mode: "boolean" }).notNull().default(false),
  autoDelete: integer({ mode: "boolean" }).notNull().default(false),
  auditLogs: integer({ mode: "boolean" }).notNull().default(false),
  groupDuplicates: integer({ mode: "boolean" }).notNull().default(true),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => [uniqueIndex("workspaces_invite_code_idx").on(t.inviteCode)]);

export const memberships = sqliteTable(
  "memberships",
  {
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text({ enum: membershipRole }).notNull().default("Viewer"),
    lastActiveAt: integer({ mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const invites = sqliteTable("invites", {
  id: text().primaryKey().$defaultFn(newId),
  workspaceId: text()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text().notNull(),
  role: text({ enum: membershipRole }).notNull().default("Viewer"),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  // SHA-256 hex hash of the random session token; the plaintext only ever
  // lives in the `rw_session` cookie.
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  expiresAt: integer({ mode: "timestamp" }).notNull(),
});

export const accessTokens = sqliteTable("access_tokens", {
  id: text().primaryKey().$defaultFn(newId),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  tokenHash: text().notNull(),
  expiresAt: integer({ mode: "timestamp" }),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const integrations = sqliteTable(
  "integrations",
  {
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    connectedAt: integer({ mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.name] })],
);

export const supportMessages = sqliteTable("support_messages", {
  id: text().primaryKey().$defaultFn(newId),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text().notNull(),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const folders = sqliteTable("folders", {
  id: text().primaryKey().$defaultFn(newId),
  workspaceId: text()
    .notNull()
    .default(DEFAULT_WORKSPACE_ID)
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text().notNull(),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const recordingLinks = sqliteTable("recording_links", {
  id: text().primaryKey().$defaultFn(newId),
  workspaceId: text()
    .notNull()
    .default(DEFAULT_WORKSPACE_ID)
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text().notNull(),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const rewinds = sqliteTable(
  "rewinds",
  {
    id: text().primaryKey().$defaultFn(newId),
    title: text().notNull(),
    url: text().notNull(),
    reporterName: text().notNull(),
    status: text({
      enum: rewindStatus.options as [RewindStatus, ...RewindStatus[]],
    })
      .notNull()
      .default("new"),
    kind: text({
      enum: rewindKind.options as [RewindKind, ...RewindKind[]],
    }).notNull(),
    mediaKey: text().notNull(),
    durationSeconds: real(),
    folderId: text().references(() => folders.id, { onDelete: "set null" }),
    recordingLinkId: text().references(() => recordingLinks.id, {
      onDelete: "set null",
    }),
    workspaceId: text()
      .notNull()
      .default(DEFAULT_WORKSPACE_ID)
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Computed in a later chunk (src/lib/signature.ts); nullable until then.
    errorSignature: text(),
    createdAt: integer({ mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer({ mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("rewinds_created_at_idx").on(t.createdAt),
    uniqueIndex("rewinds_media_key_idx").on(t.mediaKey),
    index("rewinds_error_signature_idx").on(t.errorSignature),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text().primaryKey().$defaultFn(newId),
    rewindId: text()
      .notNull()
      .references(() => rewinds.id, { onDelete: "cascade" }),
    t: real().notNull(),
    kind: text({
      enum: eventKind.options as [EventKind, ...EventKind[]],
    }).notNull(),
    text: text().notNull(),
    isError: integer({ mode: "boolean" }).notNull(),
  },
  (t) => [index("events_rewind_id_idx").on(t.rewindId)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text().primaryKey().$defaultFn(newId),
    rewindId: text()
      .notNull()
      .references(() => rewinds.id, { onDelete: "cascade" }),
    t: real().notNull(),
    x: real().notNull(),
    y: real().notNull(),
    author: text().notNull(),
    text: text().notNull(),
    createdAt: integer({ mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("comments_rewind_id_idx").on(t.rewindId)],
);

export const foldersRelations = relations(folders, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [folders.workspaceId],
    references: [workspaces.id],
  }),
  rewinds: many(rewinds),
}));

export const recordingLinksRelations = relations(
  recordingLinks,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [recordingLinks.workspaceId],
      references: [workspaces.id],
    }),
    rewinds: many(rewinds),
  }),
);

export const rewindsRelations = relations(rewinds, ({ one, many }) => ({
  folder: one(folders, {
    fields: [rewinds.folderId],
    references: [folders.id],
  }),
  recordingLink: one(recordingLinks, {
    fields: [rewinds.recordingLinkId],
    references: [recordingLinks.id],
  }),
  workspace: one(workspaces, {
    fields: [rewinds.workspaceId],
    references: [workspaces.id],
  }),
  events: many(events),
  comments: many(comments),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  rewind: one(rewinds, {
    fields: [events.rewindId],
    references: [rewinds.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  rewind: one(rewinds, {
    fields: [comments.rewindId],
    references: [rewinds.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  memberships: many(memberships),
  invites: many(invites),
  folders: many(folders),
  recordingLinks: many(recordingLinks),
  rewinds: many(rewinds),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  accessTokens: many(accessTokens),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [memberships.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [invites.workspaceId],
    references: [workspaces.id],
  }),
}));

export const accessTokensRelations = relations(accessTokens, ({ one }) => ({
  user: one(users, {
    fields: [accessTokens.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [sessions.workspaceId],
    references: [workspaces.id],
  }),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [integrations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const supportMessagesRelations = relations(
  supportMessages,
  ({ one }) => ({
    user: one(users, {
      fields: [supportMessages.userId],
      references: [users.id],
    }),
  }),
);

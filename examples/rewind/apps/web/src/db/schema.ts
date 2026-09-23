import { relations } from "drizzle-orm";
import {
  index,
  integer,
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

export const folders = sqliteTable("folders", {
  id: text().primaryKey().$defaultFn(newId),
  name: text().notNull(),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const recordingLinks = sqliteTable("recording_links", {
  id: text().primaryKey().$defaultFn(newId),
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

export const foldersRelations = relations(folders, ({ many }) => ({
  rewinds: many(rewinds),
}));

export const recordingLinksRelations = relations(
  recordingLinks,
  ({ many }) => ({
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

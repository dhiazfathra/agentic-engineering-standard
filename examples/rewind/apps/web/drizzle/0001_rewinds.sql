CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`rewindId` text NOT NULL,
	`t` real NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`rewindId`) REFERENCES `rewinds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_rewind_id_idx` ON `comments` (`rewindId`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`rewindId` text NOT NULL,
	`t` real NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`isError` integer NOT NULL,
	FOREIGN KEY (`rewindId`) REFERENCES `rewinds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_rewind_id_idx` ON `events` (`rewindId`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recording_links` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rewinds` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`reporterName` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`kind` text NOT NULL,
	`mediaKey` text NOT NULL,
	`durationSeconds` real,
	`folderId` text,
	`recordingLinkId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`folderId`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recordingLinkId`) REFERENCES `recording_links`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `rewinds_created_at_idx` ON `rewinds` (`createdAt`);
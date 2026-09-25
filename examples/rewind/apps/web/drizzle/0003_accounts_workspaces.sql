CREATE TABLE `access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`tokenHash` text NOT NULL,
	`expiresAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`workspaceId` text NOT NULL,
	`name` text NOT NULL,
	`connectedAt` integer NOT NULL,
	PRIMARY KEY(`workspaceId`, `name`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'Viewer' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`workspaceId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'Viewer' NOT NULL,
	`lastActiveAt` integer NOT NULL,
	PRIMARY KEY(`workspaceId`, `userId`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`workspaceId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`text` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`passwordHash` text NOT NULL,
	`firstName` text NOT NULL,
	`lastName` text NOT NULL,
	`role` text DEFAULT 'Engineering' NOT NULL,
	`avatarKey` text,
	`theme` text DEFAULT 'light' NOT NULL,
	`notifyN1` integer DEFAULT true NOT NULL,
	`notifyN2` integer DEFAULT true NOT NULL,
	`notifyN3` integer DEFAULT true NOT NULL,
	`notifyN4` integer DEFAULT true NOT NULL,
	`notifyN5` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logoKey` text,
	`inviteCode` text NOT NULL,
	`inviteLinkEnabled` integer DEFAULT true NOT NULL,
	`restrictInvites` integer DEFAULT false NOT NULL,
	`defaultLinkAccess` text DEFAULT 'members' NOT NULL,
	`aiEnabled` integer DEFAULT false NOT NULL,
	`ssoEnabled` integer DEFAULT false NOT NULL,
	`autoDelete` integer DEFAULT false NOT NULL,
	`auditLogs` integer DEFAULT false NOT NULL,
	`groupDuplicates` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_invite_code_idx` ON `workspaces` (`inviteCode`);--> statement-breakpoint
-- Hand-edited: existing folders/recording_links/rewinds need a workspace to
-- point at before the NOT NULL columns below apply their literal default
-- ('default-workspace'), so this fixed-id row is inserted first. Pre-existing
-- data has no notion of workspace membership, so this workspace stays open
-- (defaultLinkAccess 'anyone') to keep old public rewind links working.
INSERT INTO `workspaces` (`id`, `name`, `inviteCode`, `defaultLinkAccess`, `createdAt`)
VALUES ('default-workspace', 'Default Workspace', 'default-workspace-invite', 'anyone', unixepoch() * 1000)
ON CONFLICT (`id`) DO NOTHING;--> statement-breakpoint
ALTER TABLE `folders` ADD `workspaceId` text DEFAULT 'default-workspace' NOT NULL REFERENCES workspaces(id);--> statement-breakpoint
ALTER TABLE `recording_links` ADD `workspaceId` text DEFAULT 'default-workspace' NOT NULL REFERENCES workspaces(id);--> statement-breakpoint
ALTER TABLE `rewinds` ADD `workspaceId` text DEFAULT 'default-workspace' NOT NULL REFERENCES workspaces(id);--> statement-breakpoint
ALTER TABLE `rewinds` ADD `errorSignature` text;--> statement-breakpoint
CREATE INDEX `rewinds_error_signature_idx` ON `rewinds` (`errorSignature`);
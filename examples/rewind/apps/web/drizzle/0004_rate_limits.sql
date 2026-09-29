CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`windowStart` integer NOT NULL,
	`count` integer NOT NULL
);

CREATE TABLE `guild_war_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `score_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guild_war_records_unique` ON `guild_war_records` (`season_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `guild_war_records_season_idx` ON `guild_war_records` (`season_id`);--> statement-breakpoint
CREATE TABLE `guild_war_match_inputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`date` text NOT NULL,
	`wins` integer NOT NULL,
	`losses` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `score_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guild_war_match_inputs_member_idx` ON `guild_war_match_inputs` (`season_id`,`member_id`);

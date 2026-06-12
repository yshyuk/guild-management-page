CREATE TABLE `dashboard_range_setting` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_month_mode` integer DEFAULT false NOT NULL,
	`month_base_date` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guild_war_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `guild_war_periods_start_idx` ON `guild_war_periods` (`start_date`);--> statement-breakpoint
CREATE INDEX `guild_war_periods_end_idx` ON `guild_war_periods` (`end_date`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_name_unique` ON `members` (`name`);--> statement-breakpoint
CREATE TABLE `miss_log_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`miss_log_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	FOREIGN KEY (`miss_log_id`) REFERENCES `miss_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `miss_log_members_unique` ON `miss_log_members` (`miss_log_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `miss_log_members_member_idx` ON `miss_log_members` (`member_id`);--> statement-breakpoint
CREATE TABLE `miss_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `miss_logs_date_idx` ON `miss_logs` (`date`);--> statement-breakpoint
CREATE INDEX `miss_logs_content_idx` ON `miss_logs` (`content`);--> statement-breakpoint
CREATE TABLE `raid_deadlines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raid_deadlines_date_unique` ON `raid_deadlines` (`date`);--> statement-breakpoint
CREATE INDEX `raid_deadlines_date_idx` ON `raid_deadlines` (`date`);--> statement-breakpoint
CREATE TABLE `score_seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`round_count` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `score_seasons_type_idx` ON `score_seasons` (`type`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`round` integer NOT NULL,
	`score` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `score_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scores_unique` ON `scores` (`season_id`,`member_id`,`round`);--> statement-breakpoint
CREATE INDEX `scores_season_idx` ON `scores` (`season_id`);--> statement-breakpoint
CREATE TABLE `warnings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `warnings_member_idx` ON `warnings` (`member_id`);
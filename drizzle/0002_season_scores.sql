DROP TABLE IF EXISTS `scores`;--> statement-breakpoint
DROP TABLE IF EXISTS `score_seasons`;--> statement-breakpoint
CREATE TABLE `score_seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `score_seasons_type_idx` ON `score_seasons` (`type`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`score` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `score_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scores_unique` ON `scores` (`season_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `scores_season_idx` ON `scores` (`season_id`);

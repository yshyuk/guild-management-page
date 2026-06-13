PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_score_seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_score_seasons` (`id`,`type`,`name`,`start_date`,`end_date`,`created_at`) SELECT `id`,`type`,`name`,`start_date`,`end_date`,`created_at` FROM `score_seasons`;--> statement-breakpoint
DROP TABLE `score_seasons`;--> statement-breakpoint
ALTER TABLE `__new_score_seasons` RENAME TO `score_seasons`;--> statement-breakpoint
CREATE INDEX `score_seasons_type_idx` ON `score_seasons` (`type`);--> statement-breakpoint
PRAGMA foreign_keys=ON;

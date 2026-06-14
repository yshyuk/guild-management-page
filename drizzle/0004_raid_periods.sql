CREATE TABLE `__new_raid_deadlines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_raid_deadlines` (`id`,`start_date`,`end_date`,`created_at`) SELECT `id`,`date`,`date`,`created_at` FROM `raid_deadlines`;--> statement-breakpoint
DROP TABLE `raid_deadlines`;--> statement-breakpoint
ALTER TABLE `__new_raid_deadlines` RENAME TO `raid_deadlines`;--> statement-breakpoint
CREATE INDEX `raid_deadlines_start_idx` ON `raid_deadlines` (`start_date`);--> statement-breakpoint
CREATE INDEX `raid_deadlines_end_idx` ON `raid_deadlines` (`end_date`);

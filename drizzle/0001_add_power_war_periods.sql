CREATE TABLE `power_war_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `power_war_periods_start_idx` ON `power_war_periods` (`start_date`);--> statement-breakpoint
CREATE INDEX `power_war_periods_end_idx` ON `power_war_periods` (`end_date`);
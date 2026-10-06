CREATE TABLE `bot_lesson` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`bot` text NOT NULL,
	`thread_id` text,
	`thread_label` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`before` text,
	`after` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`undone_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_bot_lesson_thread` ON `bot_lesson` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_bot_lesson_bot` ON `bot_lesson` (`bot`,`created_at`);
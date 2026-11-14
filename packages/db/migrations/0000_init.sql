CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`ranked` integer NOT NULL,
	`player_x` text NOT NULL,
	`player_o` text NOT NULL,
	`winner` text NOT NULL,
	`reason` text NOT NULL,
	`move_count` integer NOT NULL,
	`moves` text NOT NULL,
	`x_mmr_before` integer NOT NULL,
	`x_mmr_after` integer NOT NULL,
	`o_mmr_before` integer NOT NULL,
	`o_mmr_after` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	FOREIGN KEY (`player_x`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_o`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `matches_player_x_idx` ON `matches` (`player_x`,"ended_at" desc);--> statement-breakpoint
CREATE INDEX `matches_player_o_idx` ON `matches` (`player_o`,"ended_at" desc);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mmr` integer DEFAULT 1000 NOT NULL,
	`games` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_mmr_idx` ON `players` ("mmr" desc);
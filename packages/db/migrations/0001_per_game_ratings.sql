-- Ratings become per game, matches record which game was played, and a match
-- can end in a draw (winner NULL). Hand-edited after `drizzle-kit generate`:
-- the generated copy step selected columns the old table does not have.
CREATE TABLE `ratings` (
	`player_id` text NOT NULL,
	`game` text NOT NULL,
	`mmr` integer DEFAULT 1000 NOT NULL,
	`games` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`player_id`, `game`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ratings_game_mmr_idx` ON `ratings` (`game`,"mmr" desc);--> statement-breakpoint
-- Everything played so far was Vanish.
INSERT INTO `ratings` ("player_id", "game", "mmr", "games", "wins", "losses", "draws")
SELECT "id", 'vanish', "mmr", "games", "wins", "losses", 0 FROM `players` WHERE "games" > 0;--> statement-breakpoint
-- SQLite cannot drop NOT NULL from a column, so rebuild the table. Nothing
-- references `matches`, so dropping it does not disturb any foreign key.
CREATE TABLE `__new_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text DEFAULT 'vanish' NOT NULL,
	`ranked` integer NOT NULL,
	`player_x` text NOT NULL,
	`player_o` text NOT NULL,
	`winner` text,
	`reason` text NOT NULL,
	`move_count` integer NOT NULL,
	`moves` text NOT NULL,
	`score_x` integer,
	`score_o` integer,
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
INSERT INTO `__new_matches`("id", "game", "ranked", "player_x", "player_o", "winner", "reason", "move_count", "moves", "score_x", "score_o", "x_mmr_before", "x_mmr_after", "o_mmr_before", "o_mmr_after", "started_at", "ended_at")
SELECT "id", 'vanish', "ranked", "player_x", "player_o", "winner", "reason", "move_count", "moves", NULL, NULL, "x_mmr_before", "x_mmr_after", "o_mmr_before", "o_mmr_after", "started_at", "ended_at" FROM `matches`;--> statement-breakpoint
DROP TABLE `matches`;--> statement-breakpoint
ALTER TABLE `__new_matches` RENAME TO `matches`;--> statement-breakpoint
CREATE INDEX `matches_player_x_idx` ON `matches` (`player_x`,"ended_at" desc);--> statement-breakpoint
CREATE INDEX `matches_player_o_idx` ON `matches` (`player_o`,"ended_at" desc);

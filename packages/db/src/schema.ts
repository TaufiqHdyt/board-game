import { desc } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable(
	'players',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		// Deprecated: ratings moved to the per-game `ratings` table. These columns
		// are kept so the previous deploy keeps working during a rollout.
		mmr: integer('mmr').notNull().default(1000),
		games: integer('games').notNull().default(0),
		wins: integer('wins').notNull().default(0),
		losses: integer('losses').notNull().default(0),
		createdAt: integer('created_at').notNull()
	},
	(t) => [index('players_mmr_idx').on(desc(t.mmr))]
);

/** One row per player per game: ratings never mix between games. */
export const ratings = sqliteTable(
	'ratings',
	{
		playerId: text('player_id')
			.notNull()
			.references(() => players.id),
		game: text('game').notNull(),
		mmr: integer('mmr').notNull().default(1000),
		games: integer('games').notNull().default(0),
		wins: integer('wins').notNull().default(0),
		losses: integer('losses').notNull().default(0),
		draws: integer('draws').notNull().default(0)
	},
	(t) => [
		primaryKey({ columns: [t.playerId, t.game] }),
		index('ratings_game_mmr_idx').on(t.game, desc(t.mmr))
	]
);

export const matches = sqliteTable(
	'matches',
	{
		id: text('id').primaryKey(),
		game: text('game').notNull().default('vanish'),
		ranked: integer('ranked', { mode: 'boolean' }).notNull(),
		/** Seat 0, the player who moved first (X in Vanish). */
		playerX: text('player_x')
			.notNull()
			.references(() => players.id),
		playerO: text('player_o')
			.notNull()
			.references(() => players.id),
		/** Null is a draw. */
		winner: text('winner').references(() => players.id),
		reason: text('reason', { enum: ['line', 'score', 'timeout', 'resign'] }).notNull(),
		moveCount: integer('move_count').notNull(),
		/** Move sequence; the final position is derived by replaying it. */
		moves: text('moves', { mode: 'json' }).$type<number[]>().notNull(),
		/** Final score per seat, for games that have one. */
		scoreX: integer('score_x'),
		scoreO: integer('score_o'),
		xMmrBefore: integer('x_mmr_before').notNull(),
		xMmrAfter: integer('x_mmr_after').notNull(),
		oMmrBefore: integer('o_mmr_before').notNull(),
		oMmrAfter: integer('o_mmr_after').notNull(),
		startedAt: integer('started_at').notNull(),
		endedAt: integer('ended_at').notNull()
	},
	(t) => [
		index('matches_player_x_idx').on(t.playerX, desc(t.endedAt)),
		index('matches_player_o_idx').on(t.playerO, desc(t.endedAt))
	]
);

export type Player = typeof players.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type Match = typeof matches.$inferSelect;

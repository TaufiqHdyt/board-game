import { desc } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable(
	'players',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		mmr: integer('mmr').notNull().default(1000),
		games: integer('games').notNull().default(0),
		wins: integer('wins').notNull().default(0),
		losses: integer('losses').notNull().default(0),
		createdAt: integer('created_at').notNull()
	},
	(t) => [index('players_mmr_idx').on(desc(t.mmr))]
);

export const matches = sqliteTable(
	'matches',
	{
		id: text('id').primaryKey(),
		ranked: integer('ranked', { mode: 'boolean' }).notNull(),
		playerX: text('player_x')
			.notNull()
			.references(() => players.id),
		playerO: text('player_o')
			.notNull()
			.references(() => players.id),
		winner: text('winner')
			.notNull()
			.references(() => players.id),
		reason: text('reason', { enum: ['line', 'timeout', 'resign'] }).notNull(),
		moveCount: integer('move_count').notNull(),
		/** Placement sequence; removals are derived by replaying it. */
		moves: text('moves', { mode: 'json' }).$type<number[]>().notNull(),
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
export type Match = typeof matches.$inferSelect;

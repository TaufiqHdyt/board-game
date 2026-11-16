import { matches, players, ratings } from '@bg/db';
import { ratingChanges, scoreForSeat0, START_MMR } from '@bg/game';
import type { MatchResult } from '@bg/proto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

/**
 * Persist a finished match and apply rating changes for that game.
 *
 * Idempotent on match id: queue deliveries are at-least-once, so a match that
 * is already stored is skipped, and the match insert plus both rating updates
 * go through one D1 batch (a single transaction).
 */
export async function recordMatch(d1: D1Database, result: MatchResult): Promise<void> {
	const db = drizzle(d1);
	const [first, second] = result.players;
	const ids = [first.pid, second.pid];

	const existing = await db.select({ id: matches.id }).from(matches).where(eq(matches.id, result.matchId));
	if (existing.length > 0) return;

	// Make sure both players and their rating rows exist (a guest may never
	// have been written yet).
	await db
		.insert(players)
		.values(result.players.map((p) => ({ id: p.pid, name: p.name, createdAt: result.endedAt })))
		.onConflictDoNothing();
	if (result.ranked) {
		await db
			.insert(ratings)
			.values(ids.map((playerId) => ({ playerId, game: result.game })))
			.onConflictDoNothing();
	}

	// Ratings come from the database, not from the (possibly stale) ticket.
	const rows = await db
		.select({ id: ratings.playerId, mmr: ratings.mmr, games: ratings.games })
		.from(ratings)
		.where(and(eq(ratings.game, result.game), inArray(ratings.playerId, ids)));
	const current = new Map(rows.map((r) => [r.id, r]));
	const unrated = { mmr: START_MMR, games: 0 };
	const firstNow = current.get(first.pid) ?? unrated;
	const secondNow = current.get(second.pid) ?? unrated;

	const [firstDelta, secondDelta] = result.ranked
		? ratingChanges(firstNow, secondNow, scoreForSeat0(result.winner))
		: [0, 0];

	const insertMatch = db
		.insert(matches)
		.values({
			id: result.matchId,
			game: result.game,
			ranked: result.ranked,
			playerX: first.pid,
			playerO: second.pid,
			winner: result.winner === null ? null : result.players[result.winner].pid,
			reason: result.reason,
			moveCount: result.moves.length,
			moves: result.moves,
			scoreX: result.scores?.[0] ?? null,
			scoreO: result.scores?.[1] ?? null,
			xMmrBefore: firstNow.mmr,
			xMmrAfter: firstNow.mmr + firstDelta,
			oMmrBefore: secondNow.mmr,
			oMmrAfter: secondNow.mmr + secondDelta,
			startedAt: result.startedAt,
			endedAt: result.endedAt
		})
		.onConflictDoNothing();

	if (!result.ranked) {
		await insertMatch;
		return;
	}

	const bump = (id: string, seat: 0 | 1, mmrDelta: number) =>
		db
			.update(ratings)
			.set({
				mmr: sql`${ratings.mmr} + ${mmrDelta}`,
				games: sql`${ratings.games} + 1`,
				wins: sql`${ratings.wins} + ${result.winner === seat ? 1 : 0}`,
				losses: sql`${ratings.losses} + ${result.winner !== null && result.winner !== seat ? 1 : 0}`,
				draws: sql`${ratings.draws} + ${result.winner === null ? 1 : 0}`
			})
			.where(and(eq(ratings.playerId, id), eq(ratings.game, result.game)));

	await db.batch([insertMatch, bump(first.pid, 0, firstDelta), bump(second.pid, 1, secondDelta)]);
}

import { matches, players } from '@bg/db';
import { eloDelta } from '@bg/game';
import type { MatchResult } from '@bg/proto';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

/**
 * Persist a finished match and apply rating changes.
 *
 * Idempotent on match id: queue deliveries are at-least-once, and the insert
 * uses ON CONFLICT DO NOTHING while the player updates are guarded by the
 * existence check, all inside one D1 batch (a single transaction).
 */
export async function recordMatch(d1: D1Database, result: MatchResult): Promise<void> {
	const db = drizzle(d1);
	const [x, o] = result.players;

	const existing = await db.select({ id: matches.id }).from(matches).where(eq(matches.id, result.matchId));
	if (existing.length > 0) return;

	// Make sure both players exist (a guest may never have been written yet).
	await db
		.insert(players)
		.values([x, o].map((p) => ({ id: p.pid, name: p.name, createdAt: result.endedAt })))
		.onConflictDoNothing();

	// Ratings come from the database, not from the (possibly stale) ticket.
	const rows = await db
		.select({ id: players.id, mmr: players.mmr, games: players.games })
		.from(players)
		.where(inArray(players.id, [x.pid, o.pid]));
	const current = new Map(rows.map((r) => [r.id, r]));
	const xNow = current.get(x.pid);
	const oNow = current.get(o.pid);
	if (!xNow || !oNow) throw new Error('player rows missing');

	const winnerSeat = result.winner;
	const [winNow, loseNow] = winnerSeat === 0 ? [xNow, oNow] : [oNow, xNow];
	const delta = result.ranked ? eloDelta(winNow, loseNow) : { winner: 0, loser: 0 };
	const xDelta = winnerSeat === 0 ? delta.winner : delta.loser;
	const oDelta = winnerSeat === 1 ? delta.winner : delta.loser;

	const insertMatch = db
		.insert(matches)
		.values({
			id: result.matchId,
			ranked: result.ranked,
			playerX: x.pid,
			playerO: o.pid,
			winner: winnerSeat === 0 ? x.pid : o.pid,
			reason: result.reason,
			moveCount: result.moves.length,
			moves: result.moves,
			xMmrBefore: xNow.mmr,
			xMmrAfter: xNow.mmr + xDelta,
			oMmrBefore: oNow.mmr,
			oMmrAfter: oNow.mmr + oDelta,
			startedAt: result.startedAt,
			endedAt: result.endedAt
		})
		.onConflictDoNothing();

	if (!result.ranked) {
		await insertMatch;
		return;
	}

	const bump = (id: string, mmrDelta: number, won: boolean) =>
		db
			.update(players)
			.set({
				mmr: sql`${players.mmr} + ${mmrDelta}`,
				games: sql`${players.games} + 1`,
				wins: sql`${players.wins} + ${won ? 1 : 0}`,
				losses: sql`${players.losses} + ${won ? 0 : 1}`
			})
			.where(eq(players.id, id));

	await db.batch([insertMatch, bump(x.pid, xDelta, winnerSeat === 0), bump(o.pid, oDelta, winnerSeat === 1)]);
}

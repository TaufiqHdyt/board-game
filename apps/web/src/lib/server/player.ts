import { players, ratings, type Player } from '@bg/db';
import { START_MMR, type GameId } from '@bg/game';
import type { Session } from '@bg/proto';
import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

// With adapter-cloudflare 8, bindings come from `cloudflare:workers` in both
// development and production; there is no `event.platform` any more.
export { env };

export function getDb() {
	return drizzle(env.DB);
}

/** Fetch the player row for a session, creating it on first use. */
export async function ensurePlayer(db: ReturnType<typeof getDb>, session: Session): Promise<Player> {
	await db
		.insert(players)
		.values({ id: session.pid, name: session.name, createdAt: Date.now() })
		.onConflictDoNothing();
	const [row] = await db.select().from(players).where(eq(players.id, session.pid));
	if (!row) error(500, 'Could not load player');
	return row;
}

export interface Record {
	mmr: number;
	games: number;
	wins: number;
	losses: number;
	draws: number;
}

const UNRATED: Record = { mmr: START_MMR, games: 0, wins: 0, losses: 0, draws: 0 };

/** A player's standing in one game. Rows only exist once a ranked game is finished. */
export async function getRecord(
	db: ReturnType<typeof getDb>,
	playerId: string,
	game: GameId
): Promise<Record> {
	const [row] = await db
		.select({
			mmr: ratings.mmr,
			games: ratings.games,
			wins: ratings.wins,
			losses: ratings.losses,
			draws: ratings.draws
		})
		.from(ratings)
		.where(and(eq(ratings.playerId, playerId), eq(ratings.game, game)));
	return row ?? UNRATED;
}

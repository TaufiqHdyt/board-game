import { players, ratings } from '@bg/db';
import { GAME_IDS, isGameId } from '@bg/game';
import { and, desc, eq, gt } from 'drizzle-orm';
import { env, getDb } from '#lib/server/player.ts';
import type { PageServerLoad } from './$types';

interface Row {
	id: string;
	name: string;
	mmr: number;
	wins: number;
	losses: number;
	draws: number;
}

const CACHE_TTL_SECONDS = 60;

export const load: PageServerLoad = async ({ locals, url }) => {
	const requested = url.searchParams.get('game');
	const game = isGameId(requested) ? requested : GAME_IDS[0];
	const cacheKey = `leaderboard:${game}:top100`;

	// Cache-aside: the busiest page reads KV and only touches D1 once a minute.
	let rows = await env.CACHE.get<Row[]>(cacheKey, 'json');
	if (!rows) {
		rows = await getDb()
			.select({
				id: players.id,
				name: players.name,
				mmr: ratings.mmr,
				wins: ratings.wins,
				losses: ratings.losses,
				draws: ratings.draws
			})
			.from(ratings)
			.innerJoin(players, eq(players.id, ratings.playerId))
			.where(and(eq(ratings.game, game), gt(ratings.games, 0)))
			.orderBy(desc(ratings.mmr), desc(ratings.wins))
			.limit(100);
		await env.CACHE.put(cacheKey, JSON.stringify(rows), { expirationTtl: CACHE_TTL_SECONDS });
	}

	return {
		game,
		rows: rows.map(({ id, ...rest }) => ({ ...rest, me: id === locals.session.pid }))
	};
};

import { players } from '@bg/db';
import { desc, gt } from 'drizzle-orm';
import { env, getDb } from '#lib/server/player.ts';
import type { PageServerLoad } from './$types';

interface Row {
	id: string;
	name: string;
	mmr: number;
	games: number;
	wins: number;
	losses: number;
}

const CACHE_KEY = 'leaderboard:top100';
const CACHE_TTL_SECONDS = 60;

export const load: PageServerLoad = async ({ locals }) => {
	// Cache-aside: the busiest page reads KV and only touches D1 once a minute.
	let rows = await env.CACHE.get<Row[]>(CACHE_KEY, 'json');
	if (!rows) {
		rows = await getDb()
			.select({
				id: players.id,
				name: players.name,
				mmr: players.mmr,
				games: players.games,
				wins: players.wins,
				losses: players.losses
			})
			.from(players)
			.where(gt(players.games, 0))
			.orderBy(desc(players.mmr), desc(players.wins))
			.limit(100);
		await env.CACHE.put(CACHE_KEY, JSON.stringify(rows), { expirationTtl: CACHE_TTL_SECONDS });
	}

	return {
		rows: rows.map(({ id, ...rest }) => ({ ...rest, me: id === locals.session.pid }))
	};
};

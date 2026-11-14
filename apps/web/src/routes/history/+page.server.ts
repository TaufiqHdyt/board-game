import { matches, players } from '@bg/db';
import { desc, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '#lib/server/player.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const me = locals.session.pid;

	const rows = await db
		.select()
		.from(matches)
		.where(or(eq(matches.playerX, me), eq(matches.playerO, me)))
		.orderBy(desc(matches.endedAt))
		.limit(50);

	const opponentIds = [...new Set(rows.map((m) => (m.playerX === me ? m.playerO : m.playerX)))];
	const names = new Map(
		opponentIds.length === 0
			? []
			: (
					await db
						.select({ id: players.id, name: players.name })
						.from(players)
						.where(inArray(players.id, opponentIds))
				).map((p) => [p.id, p.name] as const)
	);

	return {
		matches: rows.map((m) => {
			const asX = m.playerX === me;
			const before = asX ? m.xMmrBefore : m.oMmrBefore;
			const after = asX ? m.xMmrAfter : m.oMmrAfter;
			return {
				id: m.id,
				opponent: names.get(asX ? m.playerO : m.playerX) ?? 'Unknown',
				symbol: asX ? 'X' : 'O',
				won: m.winner === me,
				reason: m.reason,
				ranked: m.ranked,
				moveCount: m.moveCount,
				ratingChange: after - before,
				endedAt: m.endedAt
			};
		})
	};
};

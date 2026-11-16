import { readdirSync, readFileSync } from 'node:fs';
import type { MatchResult, PlayerInfo } from '@bg/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { recordMatch } from './results';

// Runs against a throwaway local D1 with the real migrations applied.
const MIGRATIONS = new URL('../../../packages/db/migrations/', import.meta.url);

let proxy: PlatformProxy<{ DB: D1Database }>;
let db: D1Database;

beforeAll(async () => {
	proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
	db = proxy.env.DB;
	for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
		const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
		for (const statement of sql.split('--> statement-breakpoint')) {
			const trimmed = statement
				.split('\n')
				.filter((line) => !line.trim().startsWith('--'))
				.join('\n')
				.trim();
			if (trimmed) await db.prepare(trimmed).run();
		}
	}
});

afterAll(() => proxy?.dispose());

let counter = 0;
function player(name: string): PlayerInfo {
	return { pid: `${name}-${++counter}`, name, mmr: 1000, games: 0 };
}

function result(overrides: Partial<MatchResult> & Pick<MatchResult, 'players'>): MatchResult {
	return {
		matchId: `match-${++counter}`,
		game: 'congklak',
		ranked: true,
		winner: 0,
		scores: [60, 38],
		reason: 'score',
		moves: [1, 2, 3],
		startedAt: 1,
		endedAt: 2,
		...overrides
	};
}

async function rating(pid: string, game: string) {
	return db
		.prepare('select mmr, games, wins, losses, draws from ratings where player_id = ? and game = ?')
		.bind(pid, game)
		.first<{ mmr: number; games: number; wins: number; losses: number; draws: number }>();
}

describe('recordMatch', () => {
	it('records a win and moves both ratings for that game only', async () => {
		const a = player('a');
		const b = player('b');
		await recordMatch(db, result({ players: [a, b], winner: 1, scores: [40, 58] }));

		expect(await rating(a.pid, 'congklak')).toEqual({ mmr: 984, games: 1, wins: 0, losses: 1, draws: 0 });
		expect(await rating(b.pid, 'congklak')).toEqual({ mmr: 1016, games: 1, wins: 1, losses: 0, draws: 0 });
		expect(await rating(a.pid, 'vanish')).toBeNull();
	});

	it('records a draw with a null winner and counts it for both players', async () => {
		const a = player('a');
		const b = player('b');
		const match = result({ players: [a, b], winner: null, scores: [49, 49] });
		await recordMatch(db, match);

		const row = await db
			.prepare('select winner, score_x, score_o, game from matches where id = ?')
			.bind(match.matchId)
			.first();
		expect(row).toEqual({ winner: null, score_x: 49, score_o: 49, game: 'congklak' });
		expect(await rating(a.pid, 'congklak')).toEqual({ mmr: 1000, games: 1, wins: 0, losses: 0, draws: 1 });
		expect(await rating(b.pid, 'congklak')).toEqual({ mmr: 1000, games: 1, wins: 0, losses: 0, draws: 1 });
	});

	it('a draw between unequal players moves rating towards the lower one', async () => {
		const a = player('a');
		const b = player('b');
		// Give `a` a head start with two wins.
		await recordMatch(db, result({ players: [a, b], winner: 0 }));
		await recordMatch(db, result({ players: [a, b], winner: 0 }));
		const before = [await rating(a.pid, 'congklak'), await rating(b.pid, 'congklak')];
		await recordMatch(db, result({ players: [a, b], winner: null, scores: [49, 49] }));
		const after = [await rating(a.pid, 'congklak'), await rating(b.pid, 'congklak')];
		expect(after[0]!.mmr).toBeLessThan(before[0]!.mmr);
		expect(after[1]!.mmr).toBeGreaterThan(before[1]!.mmr);
	});

	it('is idempotent when the queue redelivers a result', async () => {
		const a = player('a');
		const b = player('b');
		const match = result({ players: [a, b] });
		await recordMatch(db, match);
		await recordMatch(db, match);
		expect((await rating(a.pid, 'congklak'))!.games).toBe(1);
		const count = await db.prepare('select count(*) as n from matches where id = ?').bind(match.matchId).first();
		expect(count).toEqual({ n: 1 });
	});

	it('stores unranked games without touching ratings', async () => {
		const a = player('a');
		const b = player('b');
		await recordMatch(db, result({ players: [a, b], ranked: false, game: 'vanish', scores: null, reason: 'line' }));
		expect(await rating(a.pid, 'vanish')).toBeNull();
		const row = await db.prepare('select x_mmr_before, x_mmr_after from matches where player_x = ?').bind(a.pid).first();
		expect(row).toEqual({ x_mmr_before: 1000, x_mmr_after: 1000 });
	});
});

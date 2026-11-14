import { describe, expect, it } from 'vitest';
import { eloDelta, expectedScore, kFactor } from './elo';

describe('elo', () => {
	it('uses a larger K during placement', () => {
		expect(kFactor(0)).toBe(32);
		expect(kFactor(19)).toBe(32);
		expect(kFactor(20)).toBe(16);
	});

	it('expects 50% between equals', () => {
		expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
	});

	it('moves equal new players by 16', () => {
		expect(eloDelta({ mmr: 1000, games: 0 }, { mmr: 1000, games: 0 })).toEqual({
			winner: 16,
			loser: -16
		});
	});

	it('rewards an upset more than an expected win', () => {
		const upset = eloDelta({ mmr: 900, games: 30 }, { mmr: 1300, games: 30 });
		const expected = eloDelta({ mmr: 1300, games: 30 }, { mmr: 900, games: 30 });
		expect(upset.winner).toBeGreaterThan(expected.winner);
		expect(expected.winner).toBeGreaterThanOrEqual(1);
	});
});

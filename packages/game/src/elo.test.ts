import { describe, expect, it } from 'vitest';
import { expectedScore, kFactor, ratingChanges, scoreForSeat0 } from './elo';

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
		const fresh = { mmr: 1000, games: 0 };
		expect(ratingChanges(fresh, fresh, 1)).toEqual([16, -16]);
		expect(ratingChanges(fresh, fresh, 0)).toEqual([-16, 16]);
	});

	it('leaves equal players unchanged on a draw', () => {
		const fresh = { mmr: 1000, games: 0 };
		expect(ratingChanges(fresh, fresh, 0.5)).toEqual([0, 0]);
	});

	it('a draw moves the lower-rated player up and the higher one down', () => {
		const [low, high] = ratingChanges({ mmr: 900, games: 30 }, { mmr: 1300, games: 30 }, 0.5);
		expect(low).toBeGreaterThan(0);
		expect(high).toBeLessThan(0);
	});

	it('rewards an upset more than an expected win', () => {
		const [upset] = ratingChanges({ mmr: 900, games: 30 }, { mmr: 1300, games: 30 }, 1);
		const [expected] = ratingChanges({ mmr: 1300, games: 30 }, { mmr: 900, games: 30 }, 1);
		expect(upset).toBeGreaterThan(expected);
		expect(expected).toBeGreaterThanOrEqual(1);
	});

	it('maps a winner to seat 0 score', () => {
		expect(scoreForSeat0(0)).toBe(1);
		expect(scoreForSeat0(1)).toBe(0);
		expect(scoreForSeat0(null)).toBe(0.5);
	});
});

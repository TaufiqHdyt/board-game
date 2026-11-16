import { describe, expect, it } from 'vitest';
import {
	HOLES,
	TOTAL_SEEDS,
	newCongklak,
	oppositePos,
	playableHoles,
	ringOf,
	sow,
	storePos,
	type CongklakState
} from './congklak';
import type { Seat } from './rules';

function total(state: CongklakState): number {
	return [...state.holes[0], ...state.holes[1], ...state.stores].reduce((a, b) => a + b, 0);
}

/** Build a position by hand; unspecified holes are empty. */
function position(
	p0: Partial<Record<number, number>>,
	p1: Partial<Record<number, number>>,
	turn: Seat = 0,
	stores: [number, number] = [0, 0]
): CongklakState {
	const row = (spec: Partial<Record<number, number>>) =>
		Array.from({ length: HOLES }, (_, i) => spec[i] ?? 0);
	return { holes: [row(p0), row(p1)], stores, turn, over: false, winner: null, moveCount: 0 };
}

function play(state: CongklakState, hole: number) {
	const result = sow(state, state.turn, hole);
	if (!result.ok) throw new Error(result.error);
	return result;
}

describe('congklak board geometry', () => {
	it('faces hole i with hole 6 - i', () => {
		expect(oppositePos(ringOf(0, 0))).toBe(ringOf(1, 6));
		expect(oppositePos(ringOf(0, 6))).toBe(ringOf(1, 0));
		expect(oppositePos(ringOf(1, 2))).toBe(ringOf(0, 4));
	});

	it('starts with 98 seeds and seat 0 to move', () => {
		const state = newCongklak();
		expect(total(state)).toBe(TOTAL_SEEDS);
		expect(state.turn).toBe(0);
		expect(playableHoles(state)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});
});

describe('congklak sowing', () => {
	it('rejects bad moves', () => {
		const state = position({ 0: 1 }, { 0: 1 });
		expect(sow(state, 1, 0)).toEqual({ ok: false, error: 'not_your_turn' });
		expect(sow(state, 0, 7)).toEqual({ ok: false, error: 'out_of_range' });
		expect(sow(state, 0, 1)).toEqual({ ok: false, error: 'empty_hole' });
	});

	it('gives another turn when the last seed lands in your store', () => {
		const result = play(position({ 6: 1, 0: 3 }, { 0: 2 }), 6);
		expect(result.state.stores).toEqual([1, 0]);
		expect(result.extraTurn).toBe(true);
		expect(result.state.turn).toBe(0);
	});

	it('sows into your own store and skips the opponent store', () => {
		// 10 seeds from hole 5: hole 6, own store, seven opposing holes, then
		// past the opponent store into own hole 0. That hole was empty, so the
		// seed captures the one seed now facing it (opponent hole 6).
		const result = play(position({ 5: 10, 3: 1 }, {}), 5);
		expect(result.drops).toBe(10);
		expect(result.state.holes[1]).toEqual([1, 1, 1, 1, 1, 1, 0]);
		expect(result.state.holes[0][0]).toBe(0);
		expect(result.state.stores).toEqual([3, 0]);
		expect(result.events.some((e) => e.type === 'drop' && e.pos === storePos(1))).toBe(false);
	});

	it('ends the turn on an empty opposing hole', () => {
		// Two seeds from hole 6: one in the store, one in the opponent's hole 0.
		const result = play(position({ 6: 2, 0: 1 }, { 3: 4 }), 6);
		expect(result.state.holes[1][0]).toBe(1);
		expect(result.extraTurn).toBe(false);
		expect(result.state.turn).toBe(1);
	});

	it('captures the facing hole when landing in an empty hole of your own', () => {
		// One seed from hole 2 lands in empty hole 3, which faces opponent hole 3.
		const result = play(position({ 2: 1, 0: 2 }, { 3: 5, 0: 1 }), 2);
		expect(result.state.stores).toEqual([6, 0]);
		expect(result.state.holes[0][3]).toBe(0);
		expect(result.state.holes[1][3]).toBe(0);
		expect(result.events.at(-1)).toMatchObject({ type: 'capture', count: 6 });
		expect(result.state.turn).toBe(1);
	});

	it('leaves the seed where it is when the facing hole is empty', () => {
		const result = play(position({ 2: 1, 0: 2 }, { 0: 1 }), 2);
		expect(result.state.holes[0][3]).toBe(1);
		expect(result.state.stores).toEqual([0, 0]);
		expect(result.state.turn).toBe(1);
	});

	it('relays: landing on seeds picks them up and keeps sowing', () => {
		// Hole 0 has 2 seeds: drops in holes 1 and 2. Hole 2 held 3, now 4, so
		// they are lifted and sown into holes 3, 4, 5, 6. Hole 6 was empty and
		// faces opponent hole 0 (2 seeds): capture 3.
		const result = play(position({ 0: 2, 2: 3 }, { 0: 2, 5: 1 }), 0);
		expect(result.drops).toBe(6);
		expect(result.events.filter((e) => e.type === 'pick')).toHaveLength(2);
		expect(result.state.holes[0]).toEqual([0, 1, 0, 1, 1, 1, 0]);
		expect(result.state.stores).toEqual([3, 0]);
	});

	it('ends the game when the player to move has no seeds, sweeping the rest', () => {
		// Seat 0 plays its last seed into the store and moves again with nothing left.
		const result = play(position({ 6: 1 }, { 1: 4, 2: 5 }, 0, [40, 48]), 6);
		expect(result.state.over).toBe(true);
		expect(result.state.stores).toEqual([41, 57]);
		expect(result.state.winner).toBe(1);
		expect(total(result.state)).toBe(TOTAL_SEEDS);
		expect(playableHoles(result.state)).toEqual([]);
		expect(sow(result.state, 1, 1)).toEqual({ ok: false, error: 'game_over' });
	});

	it('records a draw at 49 each', () => {
		const result = play(position({ 6: 1 }, { 1: 1 }, 0, [48, 48]), 6);
		expect(result.state.over).toBe(true);
		expect(result.state.stores).toEqual([49, 49]);
		expect(result.state.winner).toBeNull();
	});
});

describe('congklak full games', () => {
	// A tiny deterministic generator so failures are reproducible.
	function rng(seed: number) {
		let s = seed >>> 0;
		return () => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			return s / 2 ** 32;
		};
	}

	it('keeps 98 seeds on the board and always finishes', () => {
		for (let seed = 1; seed <= 300; seed++) {
			const random = rng(seed);
			let state = newCongklak();
			let turns = 0;
			while (!state.over) {
				const options = playableHoles(state);
				expect(options.length).toBeGreaterThan(0);
				const result = play(state, options[Math.floor(random() * options.length)]!);
				state = result.state;
				expect(total(state)).toBe(TOTAL_SEEDS);
				expect(result.events.filter((e) => e.type === 'drop')).toHaveLength(result.drops);
				expect(++turns).toBeLessThan(5000);
			}
			expect(state.stores[0] + state.stores[1]).toBe(TOTAL_SEEDS);
			const expected = state.stores[0] === state.stores[1] ? null : state.stores[0] > state.stores[1] ? 0 : 1;
			expect(state.winner).toBe(expected);
		}
	});
});

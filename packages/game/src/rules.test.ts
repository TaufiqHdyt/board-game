import { describe, expect, it } from 'vitest';
import { applyMove, cellOwner, fadingCell, newBoard, replay, winningLine, type Board } from './rules';

function play(moves: number[]): Board {
	return replay(moves);
}

describe('disappearing-marks rules', () => {
	it('X moves first and turns alternate', () => {
		const b = newBoard();
		expect(applyMove(b, 1, 0)).toEqual({ ok: false, error: 'not_your_turn' });
		const r = applyMove(b, 0, 4);
		expect(r.ok && r.board.turn).toBe(1);
	});

	it('rejects occupied and out-of-range cells', () => {
		const b = play([4]);
		expect(applyMove(b, 1, 4)).toEqual({ ok: false, error: 'occupied' });
		expect(applyMove(b, 1, 9)).toEqual({ ok: false, error: 'out_of_range' });
		expect(applyMove(b, 1, 1.5)).toEqual({ ok: false, error: 'out_of_range' });
	});

	it('wins with three in a line', () => {
		const b = play([0, 3, 1, 4, 2]);
		expect(b.winner).toBe(0);
		expect(winningLine(b)).toEqual([0, 1, 2]);
		expect(applyMove(b, 1, 8)).toEqual({ ok: false, error: 'game_over' });
	});

	it('removes the oldest mark on the fourth placement', () => {
		// X: 0, 1, 5 then 6 -> 0 vanishes. O: 3, 2, 7.
		const before = play([0, 3, 1, 2, 5, 7]);
		expect(fadingCell(before, 0)).toBe(0);
		const r = applyMove(before, 0, 6);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.removed).toBe(0);
		expect(r.board.marks[0]).toEqual([1, 5, 6]);
		expect(cellOwner(r.board, 0)).toBeNull();
	});

	it('never holds more than three marks per player', () => {
		const b = play([0, 3, 1, 2, 5, 7, 6, 0, 8, 4]);
		expect(b.marks[0].length).toBeLessThanOrEqual(3);
		expect(b.marks[1].length).toBeLessThanOrEqual(3);
	});

	it('cannot play into the cell that is about to vanish', () => {
		const b = play([0, 3, 1, 2, 5, 7]);
		expect(applyMove(b, 0, 0)).toEqual({ ok: false, error: 'occupied' });
	});

	it('a vanishing mark does not count toward a line', () => {
		// X holds 0, 1, 5. Playing 2 would make 0-1-2, but 0 vanishes first.
		const b = play([0, 3, 1, 4, 5, 8]);
		const r = applyMove(b, 0, 2);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.board.marks[0]).toEqual([1, 5, 2]);
		expect(r.board.winner).toBeNull();
	});

	it('an opponent can take a vacated cell', () => {
		const b = play([0, 3, 1, 2, 5, 7, 6]);
		const r = applyMove(b, 1, 0);
		expect(r.ok).toBe(true);
	});

	it('replay throws on an illegal sequence', () => {
		expect(() => replay([0, 0])).toThrow();
	});
});

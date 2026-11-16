/**
 * Tic-tac-toe with disappearing marks.
 *
 * Each player may have at most MAX_MARKS marks on the board. Placing one more
 * removes that player's oldest mark, so the board never fills and a draw is
 * impossible. Seat 0 is X and always moves first.
 */

export type Seat = 0 | 1;

export const MAX_MARKS = 3;

export const LINES: readonly (readonly [number, number, number])[] = [
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 6],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6]
];

export interface Board {
	/** Cells held by each seat, oldest first. */
	marks: [number[], number[]];
	turn: Seat;
	winner: Seat | null;
	moveCount: number;
}

export type MoveError = 'game_over' | 'not_your_turn' | 'out_of_range' | 'occupied';

export type MoveResult =
	| { ok: true; board: Board; removed: number | null }
	| { ok: false; error: MoveError };

export function newBoard(): Board {
	return { marks: [[], []], turn: 0, winner: null, moveCount: 0 };
}

export function otherSeat(seat: Seat): Seat {
	return seat === 0 ? 1 : 0;
}

export function cellOwner(board: Board, cell: number): Seat | null {
	if (board.marks[0].includes(cell)) return 0;
	if (board.marks[1].includes(cell)) return 1;
	return null;
}

/** The mark that will vanish on this seat's next move, if any. */
export function fadingCell(board: Board, seat: Seat): number | null {
	const own = board.marks[seat];
	return own.length >= MAX_MARKS ? (own[0] ?? null) : null;
}

export function hasLine(cells: readonly number[]): boolean {
	return LINES.some((line) => line.every((c) => cells.includes(c)));
}

/** The winning line for a seat, for highlighting. */
export function winningLine(board: Board): readonly number[] | null {
	if (board.winner === null) return null;
	const own = board.marks[board.winner];
	return LINES.find((line) => line.every((c) => own.includes(c))) ?? null;
}

/**
 * Order of operations: validate, place, remove the mover's oldest mark if they
 * now exceed the limit, then check for a win. The cell being vacated is still
 * occupied at validation time, so it cannot be played into on the same move.
 */
export function applyMove(board: Board, seat: Seat, cell: number): MoveResult {
	if (board.winner !== null) return { ok: false, error: 'game_over' };
	if (seat !== board.turn) return { ok: false, error: 'not_your_turn' };
	if (!Number.isInteger(cell) || cell < 0 || cell > 8) return { ok: false, error: 'out_of_range' };
	if (cellOwner(board, cell) !== null) return { ok: false, error: 'occupied' };

	const own = [...board.marks[seat], cell];
	let removed: number | null = null;
	if (own.length > MAX_MARKS) removed = own.shift() ?? null;

	const marks: [number[], number[]] =
		seat === 0 ? [own, [...board.marks[1]]] : [[...board.marks[0]], own];
	const won = hasLine(own);

	return {
		ok: true,
		removed,
		board: {
			marks,
			turn: won ? seat : otherSeat(seat),
			winner: won ? seat : null,
			moveCount: board.moveCount + 1
		}
	};
}

/** Rebuild a board from the placement sequence (removals are deterministic). */
export function replay(moves: readonly number[]): Board {
	let board = newBoard();
	for (const cell of moves) {
		const result = applyMove(board, board.turn, cell);
		if (!result.ok) throw new Error(`illegal move ${cell}: ${result.error}`);
		board = result.board;
	}
	return board;
}

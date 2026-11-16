/**
 * Congklak (dhakon): the Indonesian sowing game.
 *
 * Board: seven holes and one store per player, seven seeds per hole (98 seeds).
 *
 * A turn: take every seed from one of your holes and sow them one by one,
 * clockwise, into each hole and your own store (never the opponent's store).
 * What happens next depends on where the last seed lands:
 *   - your store: you move again;
 *   - a hole that already held seeds (either side): pick them all up and keep
 *     sowing;
 *   - an empty hole on your side: capture that seed together with the seeds in
 *     the opposite hole, if there are any, and the turn ends;
 *   - an empty hole on the opponent's side: the turn ends.
 *
 * The game ends when the player to move has no seeds in their holes. Seeds
 * still on the board go to the store of the side they sit on. More seeds wins;
 * 49 each is a draw.
 */
import type { Seat } from './rules';

export const HOLES = 7;
export const SEEDS_PER_HOLE = 7;
export const TOTAL_SEEDS = 2 * HOLES * SEEDS_PER_HOLE;
/** Safety valve: relay sowing is long but must never hang a turn. */
export const MAX_SOW_STEPS = 2000;

export interface CongklakState {
	/** Seeds in each player's holes. Sowing runs from index 0 up to 6, then the store. */
	holes: [number[], number[]];
	stores: [number, number];
	turn: Seat;
	over: boolean;
	/** Set when over; null with `over` true means a draw. */
	winner: Seat | null;
	moveCount: number;
}

/**
 * A position on the sowing ring. 0-6 are seat 0's holes, 7 is seat 0's store,
 * 8-14 are seat 1's holes and 15 is seat 1's store. Sowing increases the index.
 */
export type RingPos = number;
const RING = 2 * (HOLES + 1);

export function ringOf(seat: Seat, hole: number): RingPos {
	return seat * (HOLES + 1) + hole;
}
export function storePos(seat: Seat): RingPos {
	return seat * (HOLES + 1) + HOLES;
}
export function sideOf(pos: RingPos): Seat {
	return pos < HOLES + 1 ? 0 : 1;
}
export function isStore(pos: RingPos): boolean {
	return pos % (HOLES + 1) === HOLES;
}
/** The hole directly across the board. */
export function oppositePos(pos: RingPos): RingPos {
	const seat = sideOf(pos);
	const hole = pos % (HOLES + 1);
	return ringOf(seat === 0 ? 1 : 0, HOLES - 1 - hole);
}

export type SowEvent =
	/** The mover lifts every seed out of a hole. */
	| { type: 'pick'; pos: RingPos; count: number }
	/** One seed is dropped. */
	| { type: 'drop'; pos: RingPos }
	/** Seeds move from two facing holes into the mover's store. */
	| { type: 'capture'; from: [RingPos, RingPos]; count: number }
	/** End of game: the seeds left on one side go to that side's store. */
	| { type: 'sweep'; seat: Seat; count: number };

export type CongklakError = 'game_over' | 'not_your_turn' | 'out_of_range' | 'empty_hole';

export type SowResult =
	| { ok: true; state: CongklakState; events: SowEvent[]; drops: number; extraTurn: boolean }
	| { ok: false; error: CongklakError };

export function newCongklak(): CongklakState {
	return {
		holes: [Array(HOLES).fill(SEEDS_PER_HOLE), Array(HOLES).fill(SEEDS_PER_HOLE)],
		stores: [0, 0],
		turn: 0,
		over: false,
		winner: null,
		moveCount: 0
	};
}

export function seedsAt(state: CongklakState, pos: RingPos): number {
	const seat = sideOf(pos);
	return isStore(pos) ? state.stores[seat] : (state.holes[seat][pos % (HOLES + 1)] ?? 0);
}

export function playableHoles(state: CongklakState): number[] {
	if (state.over) return [];
	return state.holes[state.turn].flatMap((count, hole) => (count > 0 ? [hole] : []));
}

export function sow(state: CongklakState, seat: Seat, hole: number): SowResult {
	if (state.over) return { ok: false, error: 'game_over' };
	if (seat !== state.turn) return { ok: false, error: 'not_your_turn' };
	if (!Number.isInteger(hole) || hole < 0 || hole >= HOLES) {
		return { ok: false, error: 'out_of_range' };
	}
	if ((state.holes[seat][hole] ?? 0) === 0) return { ok: false, error: 'empty_hole' };

	// Work on a flat copy of the ring.
	const ring: number[] = [];
	for (let pos = 0; pos < RING; pos++) ring.push(seedsAt(state, pos));
	const events: SowEvent[] = [];
	const other: Seat = seat === 0 ? 1 : 0;
	const ownStore = storePos(seat);
	const skip = storePos(other);

	let pos = ringOf(seat, hole);
	let hand = ring[pos]!;
	ring[pos] = 0;
	events.push({ type: 'pick', pos, count: hand });

	let drops = 0;
	let extraTurn = false;

	for (;;) {
		while (hand > 0) {
			pos = (pos + 1) % RING;
			if (pos === skip) pos = (pos + 1) % RING;
			ring[pos] = ring[pos]! + 1;
			hand -= 1;
			drops += 1;
			events.push({ type: 'drop', pos });
		}

		if (pos === ownStore) {
			extraTurn = true;
			break;
		}
		if (ring[pos]! > 1 && drops < MAX_SOW_STEPS) {
			// Landed on seeds: lift the lot and carry on.
			hand = ring[pos]!;
			ring[pos] = 0;
			events.push({ type: 'pick', pos, count: hand });
			continue;
		}
		if (ring[pos] === 1 && sideOf(pos) === seat) {
			const facing = oppositePos(pos);
			if (ring[facing]! > 0) {
				const count = ring[facing]! + 1;
				ring[facing] = 0;
				ring[pos] = 0;
				ring[ownStore] = ring[ownStore]! + count;
				events.push({ type: 'capture', from: [pos, facing], count });
			}
		}
		break;
	}

	const next: CongklakState = {
		holes: [ring.slice(0, HOLES), ring.slice(HOLES + 1, 2 * HOLES + 1)],
		stores: [ring[storePos(0)]!, ring[storePos(1)]!],
		turn: extraTurn ? seat : other,
		over: false,
		winner: null,
		moveCount: state.moveCount + 1
	};

	// The player to move needs seeds; otherwise the game is finished.
	if (next.holes[next.turn].every((count) => count === 0)) {
		for (const side of [0, 1] as Seat[]) {
			const left = next.holes[side].reduce((sum, count) => sum + count, 0);
			if (left > 0) {
				next.stores[side] += left;
				next.holes[side] = Array(HOLES).fill(0);
				events.push({ type: 'sweep', seat: side, count: left });
			}
		}
		next.over = true;
		next.winner =
			next.stores[0] === next.stores[1] ? null : next.stores[0] > next.stores[1] ? 0 : 1;
	}

	return { ok: true, state: next, events, drops, extraTurn };
}

/**
 * The catalogue of games. The realtime room, the matchmaker and the web app
 * only talk to games through this interface, so adding a game means writing
 * its rules and a board component, not touching the plumbing.
 */
import { newCongklak, sow, type CongklakState } from './congklak';
import { applyMove, newBoard, type Board, type Seat } from './rules';

export const GAME_IDS = ['vanish', 'congklak'] as const;
export type GameId = (typeof GAME_IDS)[number];

export function isGameId(value: unknown): value is GameId {
	return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}

/** `winner: null` is a draw. */
export interface Outcome {
	winner: Seat | null;
	/** Final score per seat, for games that have one. */
	scores: [number, number] | null;
}

export type GameMoveResult<S> =
	| {
			ok: true;
			state: S;
			/** Time the opponent's screen needs to replay this move before their clock starts. */
			settleMs: number;
	  }
	| { ok: false; error: string };

export interface GameDef<S = unknown> {
	id: GameId;
	name: string;
	/** One line for the lobby. */
	pitch: string;
	canDraw: boolean;
	/** Longest a single move may take. */
	moveMs: number;
	/** Total thinking time per player for the whole match (no increment). */
	bankMs: number;
	/** How a game that is played to its natural end is recorded. */
	finishReason: 'line' | 'score';
	init(): S;
	turn(state: S): Seat;
	/** Null while the game is still going. */
	outcome(state: S): Outcome | null;
	/** Moves are small integers in every game so far: a cell or a hole. */
	applyMove(state: S, seat: Seat, move: number): GameMoveResult<S>;
}

/** Per-seed replay speed on the client, and the cap on how long a replay may run. */
export const SOW_STEP_MS = 170;
export const SOW_MAX_MS = 7000;

export function sowDuration(drops: number): number {
	return Math.min(SOW_MAX_MS, drops * SOW_STEP_MS);
}

const vanish: GameDef<Board> = {
	id: 'vanish',
	name: 'Vanish',
	pitch: 'Tic-tac-toe with three marks each. Your oldest is rubbed out, so nobody draws.',
	canDraw: false,
	moveMs: 15_000,
	bankMs: 120_000,
	finishReason: 'line',
	init: newBoard,
	turn: (state) => state.turn,
	outcome: (state) => (state.winner === null ? null : { winner: state.winner, scores: null }),
	applyMove(state, seat, move) {
		const result = applyMove(state, seat, move);
		return result.ok ? { ok: true, state: result.board, settleMs: 0 } : result;
	}
};

const congklak: GameDef<CongklakState> = {
	id: 'congklak',
	name: 'Congklak',
	pitch: 'The Indonesian sowing game, also called dhakon. Fill your store with more seeds.',
	canDraw: true,
	moveMs: 20_000,
	bankMs: 300_000,
	finishReason: 'score',
	init: newCongklak,
	turn: (state) => state.turn,
	outcome: (state) => (state.over ? { winner: state.winner, scores: [...state.stores] } : null),
	applyMove(state, seat, move) {
		const result = sow(state, seat, move);
		if (!result.ok) return result;
		// A little extra so the last seed and any capture can be seen.
		return { ok: true, state: result.state, settleMs: sowDuration(result.drops) + 600 };
	}
};

export const GAMES: { [K in GameId]: GameDef<any> } = { vanish, congklak };

export function getGame(id: GameId): GameDef<any> {
	return GAMES[id];
}

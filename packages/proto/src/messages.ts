import { z } from 'zod';

/** Keep in step with GAME_IDS in @bg/game. */
export const GameIdSchema = z.enum(['vanish', 'congklak']);
export type GameIdSchema = z.infer<typeof GameIdSchema>;

export const PlayerInfo = z.object({
	pid: z.string().min(1),
	name: z.string().min(1).max(24),
	mmr: z.number().int(),
	games: z.number().int().nonnegative()
});
export type PlayerInfo = z.infer<typeof PlayerInfo>;

/** Browser session cookie payload. */
export const Session = z.object({
	pid: z.string().min(1),
	name: z.string().min(1).max(24)
});
export type Session = z.infer<typeof Session>;

/** Short-lived permission to open one websocket on the realtime Worker. */
export const Ticket = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('queue'), game: GameIdSchema, player: PlayerInfo, exp: z.number() }),
	z.object({
		kind: z.literal('room'),
		/** Used only when this ticket opens a new private room. */
		game: GameIdSchema,
		player: PlayerInfo,
		room: z.string().min(1),
		exp: z.number()
	})
]);
export type Ticket = z.infer<typeof Ticket>;

export const TICKET_TTL_MS = 60_000;

// ---- Room socket -----------------------------------------------------------

export const ClientMsg = z.discriminatedUnion('type', [
	// A move is a small integer in every game: a cell in Vanish, a hole in Congklak.
	z.object({ type: z.literal('move'), move: z.number().int().min(0).max(63) }),
	z.object({ type: z.literal('resign') })
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

/** `line` and `score` are games played to their natural end. */
export const EndReason = z.enum(['line', 'score', 'timeout', 'resign']);
export type EndReason = z.infer<typeof EndReason>;

const SeatSchema = z.union([z.literal(0), z.literal(1)]);

export const RoomState = z.object({
	type: z.literal('state'),
	roomId: z.string(),
	game: GameIdSchema,
	ranked: z.boolean(),
	status: z.enum(['waiting', 'playing', 'ended']),
	/** Seat 0 moves first. Only one entry while waiting for an opponent. */
	players: z.array(PlayerInfo.omit({ pid: true })),
	connected: z.array(z.boolean()),
	/** Game-specific position; its shape is decided by `game`. */
	state: z.unknown(),
	turn: SeatSchema,
	moveCount: z.number(),
	/** The move that produced `state`, so clients can replay it. */
	lastMove: z.object({ seat: SeatSchema, move: z.number() }).nullable(),
	/** Set once ended. Null with status `ended` means a draw. */
	winner: SeatSchema.nullable(),
	scores: z.tuple([z.number(), z.number()]).nullable(),
	/** Remaining time bank per seat, in ms, as of turnStartedAt. */
	bank: z.tuple([z.number(), z.number()]),
	/** May lie slightly in the future while the last move is being replayed. */
	turnStartedAt: z.number(),
	moveMs: z.number(),
	/** Server clock when this message was sent, for offset correction. */
	now: z.number(),
	/** The receiver's seat. */
	you: SeatSchema,
	reason: EndReason.nullable()
});
export type RoomState = z.infer<typeof RoomState>;

export const RoomServerMsg = z.discriminatedUnion('type', [
	RoomState,
	z.object({ type: z.literal('error'), message: z.string() })
]);
export type RoomServerMsg = z.infer<typeof RoomServerMsg>;

// ---- Matchmaking socket ----------------------------------------------------

export const QueueServerMsg = z.discriminatedUnion('type', [
	z.object({ type: z.literal('queued'), waiting: z.number() }),
	z.object({
		type: z.literal('matched'),
		game: GameIdSchema,
		roomId: z.string(),
		ticket: z.string()
	})
]);
export type QueueServerMsg = z.infer<typeof QueueServerMsg>;

// ---- Results queue ---------------------------------------------------------

export const MatchResult = z.object({
	matchId: z.string(),
	game: GameIdSchema,
	ranked: z.boolean(),
	/** Seat order: seat 0 moved first. */
	players: z.tuple([PlayerInfo, PlayerInfo]),
	/** Null is a draw. */
	winner: SeatSchema.nullable(),
	scores: z.tuple([z.number(), z.number()]).nullable(),
	reason: EndReason,
	moves: z.array(z.number()),
	startedAt: z.number(),
	endedAt: z.number()
});
export type MatchResult = z.infer<typeof MatchResult>;

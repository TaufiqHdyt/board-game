import { z } from 'zod';

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
	z.object({ kind: z.literal('queue'), player: PlayerInfo, exp: z.number() }),
	z.object({ kind: z.literal('room'), player: PlayerInfo, room: z.string().min(1), exp: z.number() })
]);
export type Ticket = z.infer<typeof Ticket>;

export const TICKET_TTL_MS = 60_000;

// ---- Room socket -----------------------------------------------------------

export const ClientMsg = z.discriminatedUnion('type', [
	z.object({ type: z.literal('move'), cell: z.number().int().min(0).max(8) }),
	z.object({ type: z.literal('resign') })
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

export const EndReason = z.enum(['line', 'timeout', 'resign']);
export type EndReason = z.infer<typeof EndReason>;

const SeatSchema = z.union([z.literal(0), z.literal(1)]);

export const RoomState = z.object({
	type: z.literal('state'),
	roomId: z.string(),
	ranked: z.boolean(),
	status: z.enum(['waiting', 'playing', 'ended']),
	/** Seat 0 is X, seat 1 is O. Only one entry while waiting for an opponent. */
	players: z.array(PlayerInfo.omit({ pid: true })),
	connected: z.array(z.boolean()),
	board: z.object({
		marks: z.tuple([z.array(z.number()), z.array(z.number())]),
		turn: SeatSchema,
		winner: SeatSchema.nullable(),
		moveCount: z.number()
	}),
	/** Remaining time bank per seat, in ms, as of turnStartedAt. */
	bank: z.tuple([z.number(), z.number()]),
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
	z.object({ type: z.literal('matched'), roomId: z.string(), ticket: z.string() })
]);
export type QueueServerMsg = z.infer<typeof QueueServerMsg>;

// ---- Results queue ---------------------------------------------------------

export const MatchResult = z.object({
	matchId: z.string(),
	ranked: z.boolean(),
	/** Seat order: [X, O]. */
	players: z.tuple([PlayerInfo, PlayerInfo]),
	winner: SeatSchema,
	reason: EndReason,
	moves: z.array(z.number()),
	startedAt: z.number(),
	endedAt: z.number()
});
export type MatchResult = z.infer<typeof MatchResult>;

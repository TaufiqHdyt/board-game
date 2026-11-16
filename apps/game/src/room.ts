import { DurableObject } from 'cloudflare:workers';
import { getGame, isGameId, type GameId, type Seat } from '@bg/game';
import { ClientMsg, PlayerInfo, type EndReason, type MatchResult, type RoomServerMsg } from '@bg/proto';
import { GAME_HEADER, PLAYER_HEADER } from './player-header';

interface RoomData {
	id: string;
	game: GameId;
	ranked: boolean;
	status: 'waiting' | 'playing' | 'ended';
	/** Seat order once playing: seat 0 moves first. */
	players: PlayerInfo[];
	/** Game-specific position, owned by the rules module for `game`. */
	state: unknown;
	moves: number[];
	lastMove: { seat: Seat; move: number } | null;
	winner: Seat | null;
	scores: [number, number] | null;
	/** Remaining bank per seat as of turnStartedAt. */
	bank: [number, number];
	/** Can be slightly in the future while clients replay the previous move. */
	turnStartedAt: number;
	startedAt: number;
	endedAt: number | null;
	reason: EndReason | null;
}

const STATE_KEY = 'room';
/** Finished rooms are wiped after this long so storage does not accumulate. */
const CLEANUP_MS = 10 * 60_000;

const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/**
 * One instance per match, for any game. It is the only authority on the
 * position and the clocks: clients send intents, the room validates them with
 * the game's rules and broadcasts state. Sockets use the Hibernation API, so
 * an idle room costs nothing between moves.
 */
export class GameRoom extends DurableObject<Env> {
	private data: RoomData | null | undefined;

	private async load(): Promise<RoomData | null> {
		if (this.data === undefined) {
			const stored = (await this.ctx.storage.get<RoomData>(STATE_KEY)) ?? null;
			this.data = stored ? upgrade(stored) : null;
		}
		return this.data;
	}

	private async save(data: RoomData): Promise<void> {
		this.data = data;
		await this.ctx.storage.put(STATE_KEY, data);
	}

	private fresh(id: string, game: GameId, ranked: boolean, players: PlayerInfo[]): RoomData {
		const def = getGame(game);
		return {
			id,
			game,
			ranked,
			status: 'waiting',
			players,
			state: def.init(),
			moves: [],
			lastMove: null,
			winner: null,
			scores: null,
			bank: [def.bankMs, def.bankMs],
			turnStartedAt: 0,
			startedAt: 0,
			endedAt: null,
			reason: null
		};
	}

	private async start(data: RoomData): Promise<void> {
		const now = Date.now();
		data.status = 'playing';
		data.turnStartedAt = now;
		data.startedAt = now;
		await this.save(data);
		await this.ctx.storage.setAlarm(now + this.allowance(data));
	}

	/** Called by the matchmaker to create a ranked room with fixed seats. */
	async init(id: string, game: GameId, players: [PlayerInfo, PlayerInfo]): Promise<void> {
		if (await this.load()) return;
		await this.start(this.fresh(id, game, true, players));
	}

	async fetch(request: Request): Promise<Response> {
		const player = PlayerInfo.safeParse(
			JSON.parse(decodeURIComponent(request.headers.get(PLAYER_HEADER) ?? 'null'))
		);
		if (!player.success) return new Response('Missing player', { status: 400 });
		const me = player.data;
		const roomId = new URL(request.url).pathname.split('/').pop()!;

		let data = await this.load();
		if (!data) {
			// First visitor to an unknown id opens an unranked private room for
			// the game named on their ticket.
			const game = request.headers.get(GAME_HEADER);
			if (!isGameId(game)) return new Response('Unknown game', { status: 400 });
			data = this.fresh(roomId, game, false, [me]);
			await this.save(data);
		} else if (!data.players.some((p) => p.pid === me.pid)) {
			if (data.status !== 'waiting' || data.players.length >= 2) {
				return new Response('Room is full', { status: 403 });
			}
			data.players.push(me);
			if (Math.random() < 0.5) data.players.reverse();
			await this.start(data);
		}

		// One live socket per player: a reconnect replaces the old connection.
		for (const old of this.ctx.getWebSockets(me.pid)) {
			old.close(4000, 'Replaced by a newer connection');
		}

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1], [me.pid]);
		pair[1].serializeAttachment({ pid: me.pid });
		this.broadcast(data);
		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		const data = await this.load();
		if (!data) return;
		const seat = this.seatOf(data, ws);
		if (seat === null) return;

		let parsed;
		try {
			parsed = ClientMsg.safeParse(JSON.parse(typeof raw === 'string' ? raw : ''));
		} catch {
			parsed = null;
		}
		if (!parsed?.success) return this.send(ws, { type: 'error', message: 'Malformed message' });
		if (data.status !== 'playing') return this.send(ws, { type: 'error', message: 'game_over' });

		if (parsed.data.type === 'resign') {
			return this.finish(data, otherSeat(seat), 'resign');
		}

		const def = getGame(data.game);
		const now = Date.now();
		const turn = def.turn(data.state);
		// Moving while the previous move is still being replayed costs no time.
		const elapsed = Math.max(0, now - data.turnStartedAt);
		if (elapsed > this.allowance(data)) {
			// The alarm is about to fire anyway; settle it now.
			return this.finish(data, otherSeat(turn), 'timeout');
		}

		const result = def.applyMove(data.state, seat, parsed.data.move);
		if (!result.ok) return this.send(ws, { type: 'error', message: result.error });

		data.state = result.state;
		data.moves.push(parsed.data.move);
		data.lastMove = { seat, move: parsed.data.move };
		data.bank[seat] = Math.max(0, data.bank[seat] - elapsed);

		const outcome = def.outcome(data.state);
		if (outcome) {
			data.scores = outcome.scores;
			return this.finish(data, outcome.winner, def.finishReason);
		}

		// The next clock starts once clients have had time to replay this move.
		data.turnStartedAt = now + result.settleMs;
		await this.save(data);
		await this.ctx.storage.setAlarm(data.turnStartedAt + this.allowance(data));
		this.broadcast(data);
	}

	async webSocketClose(ws: WebSocket, code: number): Promise<void> {
		try {
			ws.close(code === 1005 || code === 1006 ? 1000 : code);
		} catch {
			// already closed
		}
		const data = await this.load();
		if (data) this.broadcast(data, ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		const data = await this.load();
		if (data) this.broadcast(data, ws);
	}

	async alarm(): Promise<void> {
		const data = await this.load();
		if (!data) return;

		if (data.status === 'ended') {
			for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Room closed');
			await this.ctx.storage.deleteAll();
			this.data = null;
			return;
		}
		if (data.status !== 'playing') return;

		const deadline = data.turnStartedAt + this.allowance(data);
		if (Date.now() >= deadline) {
			await this.finish(data, otherSeat(getGame(data.game).turn(data.state)), 'timeout');
		} else {
			await this.ctx.storage.setAlarm(deadline);
		}
	}

	/** Time the player to move may still use: the move limit or what is left in their bank. */
	private allowance(data: RoomData): number {
		const def = getGame(data.game);
		return Math.min(def.moveMs, data.bank[def.turn(data.state)]);
	}

	/** `winner` null records a draw. */
	private async finish(data: RoomData, winner: Seat | null, reason: EndReason): Promise<void> {
		const now = Date.now();
		if (reason === 'timeout' || reason === 'resign') {
			// Charge the clock for the unfinished turn so the final state is accurate.
			const turn = getGame(data.game).turn(data.state);
			data.bank[turn] = Math.max(0, data.bank[turn] - Math.max(0, now - data.turnStartedAt));
		}
		data.status = 'ended';
		data.winner = winner;
		data.reason = reason;
		data.endedAt = now;
		data.turnStartedAt = now;
		await this.save(data);
		await this.ctx.storage.setAlarm(now + CLEANUP_MS);

		const [first, second] = data.players;
		if (first && second) {
			const result: MatchResult = {
				matchId: data.id,
				game: data.game,
				ranked: data.ranked,
				players: [first, second],
				winner,
				scores: data.scores,
				reason,
				moves: data.moves,
				startedAt: data.startedAt,
				endedAt: now
			};
			await this.env.RESULTS.send(result);
		}
		this.broadcast(data);
	}

	private seatOf(data: RoomData, ws: WebSocket): Seat | null {
		const attachment = ws.deserializeAttachment() as { pid?: string } | null;
		const index = data.players.findIndex((p) => p.pid === attachment?.pid);
		return index === 0 || index === 1 ? index : null;
	}

	private send(ws: WebSocket, message: RoomServerMsg): void {
		try {
			ws.send(JSON.stringify(message));
		} catch {
			// socket is gone; the close handler will tidy up
		}
	}

	private broadcast(data: RoomData, closing?: WebSocket): void {
		const def = getGame(data.game);
		const sockets = this.ctx
			.getWebSockets()
			.filter((ws) => ws !== closing && ws.readyState === WebSocket.OPEN);
		const online = new Set(
			sockets.map((ws) => (ws.deserializeAttachment() as { pid?: string } | null)?.pid)
		);
		const base = {
			type: 'state' as const,
			roomId: data.id,
			game: data.game,
			ranked: data.ranked,
			status: data.status,
			players: data.players.map(({ name, mmr, games }) => ({ name, mmr, games })),
			connected: data.players.map((p) => online.has(p.pid)),
			state: data.state,
			turn: def.turn(data.state),
			moveCount: data.moves.length,
			lastMove: data.lastMove,
			winner: data.winner,
			scores: data.scores,
			bank: data.bank,
			turnStartedAt: data.turnStartedAt,
			moveMs: def.moveMs,
			reason: data.reason
		};
		for (const ws of sockets) {
			const seat = this.seatOf(data, ws);
			if (seat === null) continue;
			this.send(ws, { ...base, now: Date.now(), you: seat });
		}
	}
}

/**
 * Rooms created before the app had more than one game stored a Vanish board
 * under `board`. They live for minutes, so this only matters across a deploy.
 */
function upgrade(stored: RoomData): RoomData {
	const legacy = stored as RoomData & { board?: { winner: Seat | null } };
	if (legacy.game) return stored;
	return {
		...stored,
		game: 'vanish',
		state: legacy.board,
		lastMove: null,
		winner: legacy.board?.winner ?? null,
		scores: null
	};
}

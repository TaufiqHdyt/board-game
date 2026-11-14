import { DurableObject } from 'cloudflare:workers';
import { BANK_MS, MOVE_MS, applyMove, newBoard, otherSeat, type Board, type Seat } from '@bg/game';
import { ClientMsg, PlayerInfo, type EndReason, type MatchResult, type RoomServerMsg } from '@bg/proto';
import { PLAYER_HEADER } from './player-header';

interface RoomData {
	id: string;
	ranked: boolean;
	status: 'waiting' | 'playing' | 'ended';
	/** Seat order once playing: [X, O]. */
	players: PlayerInfo[];
	board: Board;
	moves: number[];
	/** Remaining bank per seat as of turnStartedAt. */
	bank: [number, number];
	turnStartedAt: number;
	startedAt: number;
	endedAt: number | null;
	reason: EndReason | null;
}

const STATE_KEY = 'room';
/** Finished rooms are wiped after this long so storage does not accumulate. */
const CLEANUP_MS = 10 * 60_000;

/**
 * One instance per match. It is the only authority on the board and the
 * clocks: clients send intents, the room validates and broadcasts state.
 * Sockets use the Hibernation API, so an idle room costs nothing between moves.
 */
export class GameRoom extends DurableObject<Env> {
	private data: RoomData | null | undefined;

	private async load(): Promise<RoomData | null> {
		if (this.data === undefined) {
			this.data = (await this.ctx.storage.get<RoomData>(STATE_KEY)) ?? null;
		}
		return this.data;
	}

	private async save(data: RoomData): Promise<void> {
		this.data = data;
		await this.ctx.storage.put(STATE_KEY, data);
	}

	/** Called by the matchmaker to create a ranked room with fixed seats. */
	async init(id: string, players: [PlayerInfo, PlayerInfo]): Promise<void> {
		if (await this.load()) return;
		const now = Date.now();
		await this.save({
			id,
			ranked: true,
			status: 'playing',
			players,
			board: newBoard(),
			moves: [],
			bank: [BANK_MS, BANK_MS],
			turnStartedAt: now,
			startedAt: now,
			endedAt: null,
			reason: null
		});
		await this.ctx.storage.setAlarm(now + MOVE_MS);
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
			// First visitor to an unknown id opens an unranked private room.
			data = {
				id: roomId,
				ranked: false,
				status: 'waiting',
				players: [me],
				board: newBoard(),
				moves: [],
				bank: [BANK_MS, BANK_MS],
				turnStartedAt: 0,
				startedAt: 0,
				endedAt: null,
				reason: null
			};
			await this.save(data);
		} else if (!data.players.some((p) => p.pid === me.pid)) {
			if (data.status !== 'waiting' || data.players.length >= 2) {
				return new Response('Room is full', { status: 403 });
			}
			data.players.push(me);
			if (Math.random() < 0.5) data.players.reverse();
			const now = Date.now();
			data.status = 'playing';
			data.turnStartedAt = now;
			data.startedAt = now;
			await this.save(data);
			await this.ctx.storage.setAlarm(now + MOVE_MS);
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
		if (data.status !== 'playing') return this.send(ws, { type: 'error', message: 'No game in progress' });

		if (parsed.data.type === 'resign') {
			return this.finish(data, otherSeat(seat), 'resign');
		}

		const now = Date.now();
		const turn = data.board.turn;
		const elapsed = now - data.turnStartedAt;
		if (elapsed > this.allowance(data)) {
			// The alarm is about to fire anyway; settle it now.
			return this.finish(data, otherSeat(turn), 'timeout');
		}

		const result = applyMove(data.board, seat, parsed.data.cell);
		if (!result.ok) return this.send(ws, { type: 'error', message: result.error });

		data.board = result.board;
		data.moves.push(parsed.data.cell);
		data.bank[seat] = Math.max(0, data.bank[seat] - elapsed);

		if (result.board.winner !== null) {
			return this.finish(data, result.board.winner, 'line');
		}

		data.turnStartedAt = now;
		await this.save(data);
		await this.ctx.storage.setAlarm(now + this.allowance(data));
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
			await this.finish(data, otherSeat(data.board.turn), 'timeout');
		} else {
			await this.ctx.storage.setAlarm(deadline);
		}
	}

	/** Time the player to move may still use: the move limit or what is left in their bank. */
	private allowance(data: RoomData): number {
		return Math.min(MOVE_MS, data.bank[data.board.turn]);
	}

	private async finish(data: RoomData, winner: Seat, reason: EndReason): Promise<void> {
		const now = Date.now();
		if (reason !== 'line') {
			// Charge the clock for the unfinished turn so the final state is accurate.
			const turn = data.board.turn;
			data.bank[turn] = Math.max(0, data.bank[turn] - (now - data.turnStartedAt));
		}
		data.status = 'ended';
		data.board = { ...data.board, winner };
		data.reason = reason;
		data.endedAt = now;
		data.turnStartedAt = now;
		await this.save(data);
		await this.ctx.storage.setAlarm(now + CLEANUP_MS);

		const [x, o] = data.players;
		if (x && o) {
			const result: MatchResult = {
				matchId: data.id,
				ranked: data.ranked,
				players: [x, o],
				winner,
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
		const sockets = this.ctx
			.getWebSockets()
			.filter((ws) => ws !== closing && ws.readyState === WebSocket.OPEN);
		const online = new Set(
			sockets.map((ws) => (ws.deserializeAttachment() as { pid?: string } | null)?.pid)
		);
		const base = {
			type: 'state' as const,
			roomId: data.id,
			ranked: data.ranked,
			status: data.status,
			players: data.players.map(({ name, mmr, games }) => ({ name, mmr, games })),
			connected: data.players.map((p) => online.has(p.pid)),
			board: data.board,
			bank: data.bank,
			turnStartedAt: data.turnStartedAt,
			moveMs: MOVE_MS,
			reason: data.reason
		};
		for (const ws of sockets) {
			const seat = this.seatOf(data, ws);
			if (seat === null) continue;
			this.send(ws, { ...base, now: Date.now(), you: seat });
		}
	}
}

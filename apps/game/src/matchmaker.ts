import { DurableObject } from 'cloudflare:workers';
import { PlayerInfo, TICKET_TTL_MS, signToken, type QueueServerMsg, type Ticket } from '@bg/proto';
import { PLAYER_HEADER } from './player-header';

interface Waiting {
	player: PlayerInfo;
	joinedAt: number;
}

/** Rating gap accepted immediately. */
const BASE_WINDOW = 50;
/** How much the accepted gap grows per second of waiting. */
const WINDOW_PER_SECOND = 25;
/** How often the queue is re-scanned while someone is waiting. */
const RESCAN_MS = 2_000;

/**
 * Single global matchmaking queue. Waiting players are simply the open
 * sockets; each carries its player and join time as a hibernation attachment,
 * so there is no separate queue state to keep in sync.
 */
export class Matchmaker extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const player = PlayerInfo.safeParse(
			JSON.parse(decodeURIComponent(request.headers.get(PLAYER_HEADER) ?? 'null'))
		);
		if (!player.success) return new Response('Missing player', { status: 400 });

		// A player can only wait once; a second tab takes over the slot.
		for (const old of this.ctx.getWebSockets(player.data.pid)) {
			old.close(4000, 'Queued from another tab');
		}

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1], [player.data.pid]);
		const waiting: Waiting = { player: player.data, joinedAt: Date.now() };
		pair[1].serializeAttachment(waiting);

		await this.matchAll();
		if (this.waiting().length > 0 && (await this.ctx.storage.getAlarm()) === null) {
			await this.ctx.storage.setAlarm(Date.now() + RESCAN_MS);
		}
		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	async alarm(): Promise<void> {
		await this.matchAll();
		if (this.waiting().length > 0) {
			await this.ctx.storage.setAlarm(Date.now() + RESCAN_MS);
		}
	}

	async webSocketMessage(): Promise<void> {
		// The queue socket is receive-only.
	}

	async webSocketClose(ws: WebSocket, code: number): Promise<void> {
		try {
			ws.close(code === 1005 || code === 1006 ? 1000 : code);
		} catch {
			// already closed
		}
	}

	private waiting(): { ws: WebSocket; info: Waiting }[] {
		return this.ctx
			.getWebSockets()
			.filter((ws) => ws.readyState === WebSocket.OPEN)
			.map((ws) => ({ ws, info: ws.deserializeAttachment() as Waiting }))
			.filter((entry) => entry.info?.player)
			.sort((a, b) => a.info.joinedAt - b.info.joinedAt);
	}

	/** Pair everyone who can be paired, longest-waiting first, closest rating wins. */
	private async matchAll(): Promise<void> {
		const queue = this.waiting();
		const taken = new Set<WebSocket>();
		const now = Date.now();

		for (const a of queue) {
			if (taken.has(a.ws)) continue;
			// `a` has waited at least as long as anyone after it, so its window applies.
			const window = BASE_WINDOW + (WINDOW_PER_SECOND * (now - a.info.joinedAt)) / 1000;
			let best: (typeof queue)[number] | null = null;
			let bestGap = Infinity;
			for (const b of queue) {
				if (b === a || taken.has(b.ws) || b.info.player.pid === a.info.player.pid) continue;
				const gap = Math.abs(a.info.player.mmr - b.info.player.mmr);
				if (gap <= window && gap < bestGap) {
					best = b;
					bestGap = gap;
				}
			}
			if (best) {
				taken.add(a.ws);
				taken.add(best.ws);
				await this.startMatch(a, best);
			}
		}

		const remaining = queue.filter((entry) => !taken.has(entry.ws));
		const update: QueueServerMsg = { type: 'queued', waiting: remaining.length };
		for (const entry of remaining) this.send(entry.ws, update);
	}

	private async startMatch(
		a: { ws: WebSocket; info: Waiting },
		b: { ws: WebSocket; info: Waiting }
	): Promise<void> {
		const roomId = crypto.randomUUID();
		// Random seats: X moves first, so this is the first-move coin flip.
		const seats: [PlayerInfo, PlayerInfo] =
			Math.random() < 0.5 ? [a.info.player, b.info.player] : [b.info.player, a.info.player];
		await this.env.GAME_ROOM.getByName(roomId).init(roomId, seats);

		for (const entry of [a, b]) {
			const ticket: Ticket = {
				kind: 'room',
				player: entry.info.player,
				room: roomId,
				exp: Date.now() + TICKET_TTL_MS
			};
			const signed = await signToken(ticket, this.env.TICKET_SECRET);
			this.send(entry.ws, { type: 'matched', roomId, ticket: signed });
			entry.ws.close(1000, 'Matched');
		}
	}

	private send(ws: WebSocket, message: QueueServerMsg): void {
		try {
			ws.send(JSON.stringify(message));
		} catch {
			// socket is gone
		}
	}
}

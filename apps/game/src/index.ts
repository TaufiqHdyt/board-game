import { MatchResult, Ticket, verifyToken } from '@bg/proto';
import { PLAYER_HEADER } from './player-header';
import { recordMatch } from './results';

export { GameRoom } from './room';
export { Matchmaker } from './matchmaker';

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const isQueue = url.pathname === '/ws/queue';
		const roomMatch = /^\/ws\/room\/([\w-]{1,64})$/.exec(url.pathname);
		if (!isQueue && !roomMatch) return new Response('Not found', { status: 404 });

		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return new Response('Expected a websocket upgrade', { status: 426 });
		}

		const payload = await verifyToken(url.searchParams.get('ticket') ?? '', env.TICKET_SECRET);
		const ticket = Ticket.safeParse(payload);
		if (!ticket.success || ticket.data.exp < Date.now()) {
			return new Response('Invalid or expired ticket', { status: 401 });
		}

		// Never trust a client-supplied copy of the player header.
		const headers = new Headers(request.headers);
		headers.set(PLAYER_HEADER, encodeURIComponent(JSON.stringify(ticket.data.player)));
		const forwarded = new Request(request, { headers });

		if (isQueue) {
			if (ticket.data.kind !== 'queue') return new Response('Wrong ticket kind', { status: 403 });
			return env.MATCHMAKER.getByName('global').fetch(forwarded);
		}

		const roomId = roomMatch![1]!;
		if (ticket.data.kind !== 'room' || ticket.data.room !== roomId) {
			return new Response('Ticket is not for this room', { status: 403 });
		}
		return env.GAME_ROOM.getByName(roomId).fetch(forwarded);
	},

	async queue(batch, env): Promise<void> {
		for (const message of batch.messages) {
			const result = MatchResult.safeParse(message.body);
			if (!result.success) {
				console.error('dropping malformed match result', result.error.message);
				message.ack();
				continue;
			}
			try {
				await recordMatch(env.DB, result.data);
				message.ack();
			} catch (error) {
				console.error('failed to record match', result.data.matchId, error);
				message.retry();
			}
		}
	}
} satisfies ExportedHandler<Env>;

import type { GameId } from '@bg/game';
import { WebSocket as ReconnectingWebSocket } from 'partysocket';

export type SocketTarget =
	| { kind: 'queue'; game: GameId }
	| { kind: 'room'; game: GameId; room: string };

interface TicketResponse {
	origin: string;
	path: string;
	ticket: string;
}

async function requestTicket(target: SocketTarget): Promise<TicketResponse> {
	const response = await fetch('/api/ticket', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(target)
	});
	if (!response.ok) throw new Error(`ticket request failed (${response.status})`);
	return (await response.json()) as TicketResponse;
}

/**
 * A reconnecting socket to the realtime Worker. Tickets expire after a minute,
 * so every (re)connect asks the web app for a fresh one.
 */
export function openSocket(target: SocketTarget): ReconnectingWebSocket {
	return new ReconnectingWebSocket(
		async () => {
			const { origin, path, ticket } = await requestTicket(target);
			const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
			// '' = same host as the page; ':8787' = the page's hostname on that port.
			const base = origin.startsWith(':')
				? `${scheme}://${location.hostname}${origin}`
				: origin || `${scheme}://${location.host}`;
			return `${base}${path}?ticket=${encodeURIComponent(ticket)}`;
		},
		undefined,
		{ maxRetries: 20, minReconnectionDelay: 500, maxReconnectionDelay: 4000 }
	);
}

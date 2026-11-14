import { TICKET_TTL_MS, signToken, type PlayerInfo, type Ticket } from '@bg/proto';
import { error, json } from '@sveltejs/kit';
import { ensurePlayer, env, getDb } from '#lib/server/player.ts';
import type { RequestHandler } from './$types';

/**
 * Issues a short-lived signed ticket that lets this browser open one socket on
 * the realtime Worker. The rating in a queue ticket is read from the database
 * here, so the client cannot choose its own matchmaking bracket.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as { kind?: string; room?: string } | null;

	const row = await ensurePlayer(getDb(), locals.session);
	const player: PlayerInfo = { pid: row.id, name: row.name, mmr: row.mmr, games: row.games };
	const exp = Date.now() + TICKET_TTL_MS;

	let ticket: Ticket;
	let path: string;
	if (body?.kind === 'queue') {
		ticket = { kind: 'queue', player, exp };
		path = '/ws/queue';
	} else if (body?.kind === 'room' && typeof body.room === 'string' && /^[\w-]{8,64}$/.test(body.room)) {
		ticket = { kind: 'room', player, room: body.room, exp };
		path = `/ws/room/${body.room}`;
	} else {
		error(400, 'Unknown ticket request');
	}

	return json({
		// '' = same host as this page, ':port' = same hostname on another port.
		origin: env.GAME_ORIGIN ?? '',
		path,
		ticket: await signToken(ticket, env.TICKET_SECRET)
	});
};

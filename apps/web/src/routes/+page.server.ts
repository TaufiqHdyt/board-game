import { players } from '@bg/db';
import { GAME_IDS, isGameId } from '@bg/game';
import { Session, signToken } from '@bg/proto';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE } from '../hooks.server';
import { ensurePlayer, env, getDb, getRecord } from '#lib/server/player.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const player = await ensurePlayer(db, locals.session);
	const records = await Promise.all(GAME_IDS.map((game) => getRecord(db, player.id, game)));
	return {
		name: player.name,
		games: GAME_IDS.map((id, i) => ({ id, record: records[i]! }))
	};
};

export const actions: Actions = {
	rename: async ({ request, locals, cookies, url }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		if (name.length < 2 || name.length > 20) {
			return fail(400, { name, message: 'Use 2 to 20 characters.' });
		}
		if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) {
			return fail(400, { name, message: 'Letters, numbers, spaces, dots, dashes and underscores only.' });
		}

		const db = getDb();
		await ensurePlayer(db, locals.session);
		await db.update(players).set({ name }).where(eq(players.id, locals.session.pid));

		const session: Session = { pid: locals.session.pid, name };
		cookies.set(SESSION_COOKIE, await signToken(session, env.TICKET_SECRET), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 365
		});
		return { message: 'Saved.', name };
	},

	room: async ({ request }) => {
		const game = (await request.formData()).get('game');
		if (!isGameId(game)) return fail(400, { name: undefined, message: 'Unknown game.' });
		// Unguessable id; whoever opens the link second becomes the opponent.
		redirect(303, `/room/${game}/${crypto.randomUUID()}`);
	}
};

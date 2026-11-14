import { Session, signToken, verifyToken } from '@bg/proto';
import type { Handle } from '@sveltejs/kit/hooks';
import { env } from 'cloudflare:workers';

export const SESSION_COOKIE = 'bg_session';
const ONE_YEAR = 60 * 60 * 24 * 365;

function guestName(): string {
	const n = crypto.getRandomValues(new Uint16Array(1))[0]! % 10000;
	return `Guest-${String(n).padStart(4, '0')}`;
}

/** Every visitor gets a guest identity in a signed cookie, so they can play at once. */
export const handle: Handle = async ({ event, resolve }) => {
	const secret = env.TICKET_SECRET ?? '';
	const cookie = event.cookies.get(SESSION_COOKIE);
	const parsed = Session.safeParse(cookie ? await verifyToken(cookie, secret) : null);

	if (parsed.success) {
		event.locals.session = parsed.data;
	} else {
		const session: Session = { pid: crypto.randomUUID(), name: guestName() };
		event.locals.session = session;
		if (secret) {
			event.cookies.set(SESSION_COOKIE, await signToken(session, secret), {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: event.url.protocol === 'https:',
				maxAge: ONE_YEAR
			});
		}
	}
	return resolve(event);
};

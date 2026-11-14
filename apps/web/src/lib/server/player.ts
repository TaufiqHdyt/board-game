import { players, type Player } from '@bg/db';
import type { Session } from '@bg/proto';
import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

// With adapter-cloudflare 8, bindings come from `cloudflare:workers` in both
// development and production; there is no `event.platform` any more.
export { env };

export function getDb() {
	return drizzle(env.DB);
}

/** Fetch the player row for a session, creating it on first use. */
export async function ensurePlayer(db: ReturnType<typeof getDb>, session: Session): Promise<Player> {
	await db
		.insert(players)
		.values({ id: session.pid, name: session.name, createdAt: Date.now() })
		.onConflictDoNothing();
	const [row] = await db.select().from(players).where(eq(players.id, session.pid));
	if (!row) error(500, 'Could not load player');
	return row;
}

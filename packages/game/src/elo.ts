export const START_MMR = 1000;
/** Matches during which a player's rating moves faster. */
export const PLACEMENT_GAMES = 20;

export interface Rated {
	mmr: number;
	games: number;
}

export function kFactor(games: number): number {
	return games < PLACEMENT_GAMES ? 32 : 16;
}

export function expectedScore(mmr: number, opponentMmr: number): number {
	return 1 / (1 + 10 ** ((opponentMmr - mmr) / 400));
}

/**
 * Rating changes for both players. `scoreA` is 1 when A won, 0 when A lost and
 * 0.5 for a draw. Each side uses its own K factor, so the two changes need not
 * mirror each other.
 */
export function ratingChanges(a: Rated, b: Rated, scoreA: 0 | 0.5 | 1): [number, number] {
	const expectedA = expectedScore(a.mmr, b.mmr);
	return [
		Math.round(kFactor(a.games) * (scoreA - expectedA)),
		Math.round(kFactor(b.games) * (1 - scoreA - (1 - expectedA)))
	];
}

/** `winner` is the seat that won, or null for a draw. */
export function scoreForSeat0(winner: 0 | 1 | null): 0 | 0.5 | 1 {
	return winner === null ? 0.5 : winner === 0 ? 1 : 0;
}

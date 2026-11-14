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

/** Rating changes for a decided match. Each side uses its own K factor. */
export function eloDelta(winner: Rated, loser: Rated): { winner: number; loser: number } {
	const expectedWin = expectedScore(winner.mmr, loser.mmr);
	return {
		winner: Math.round(kFactor(winner.games) * (1 - expectedWin)),
		loser: Math.round(kFactor(loser.games) * (0 - (1 - expectedWin)))
	};
}

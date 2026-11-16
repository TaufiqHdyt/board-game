import { isGameId } from '@bg/game';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (!isGameId(params.game)) error(404, 'No such game');
	return { game: params.game };
};

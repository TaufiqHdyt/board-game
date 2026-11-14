<script lang="ts">
	import { replay } from '@bg/game';
	import { onMount } from 'svelte';
	import Board from './Board.svelte';

	// A real game: both sides reach three marks, then every move rubs one out.
	const script = [0, 3, 1, 2, 5, 7, 6, 0, 4, 8, 2];
	const STILL = 6;

	let step = $state(STILL);
	const board = $derived(replay(script.slice(0, step)));

	const caption = $derived.by(() => {
		if (board.winner !== null) return 'Three in a line wins.';
		if (step <= STILL) return 'Each player keeps three marks at most.';
		return `${step % 2 === 1 ? 'X' : 'O'} places a fourth, and its oldest is rubbed out.`;
	});

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		step = 0;
		let timer: ReturnType<typeof setTimeout>;
		const advance = () => {
			const done = step >= script.length;
			step = done ? 0 : step + 1;
			timer = setTimeout(advance, step >= script.length ? 2600 : step > STILL ? 1500 : 650);
		};
		timer = setTimeout(advance, 500);
		return () => clearTimeout(timer);
	});
</script>

<figure>
	<div aria-hidden="true">
		<Board {board} showWin label="Example game" />
	</div>
	<figcaption class="mt-3 min-h-12 text-center text-sm text-dust" aria-live="off">
		{caption}
	</figcaption>
</figure>

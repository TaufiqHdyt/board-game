<script lang="ts">
	import { cellOwner, fadingCell, winningLine, type Board, type Seat } from '@bg/game';
	import { fade } from 'svelte/transition';

	interface Props {
		board: Board;
		/** Show which marks are next to be rubbed out. */
		showFading?: boolean;
		/** Strike through the winning line. */
		showWin?: boolean;
		/** Seat allowed to click right now, or null for a read-only board. */
		canPlay?: Seat | null;
		onplay?: (cell: number) => void;
		label?: string;
	}

	let {
		board,
		showFading = true,
		showWin = false,
		canPlay = null,
		onplay,
		label = 'Board'
	}: Props = $props();

	const uid = $props.id();
	const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
	const names = ['X', 'O'] as const;

	const center = (cell: number) => ({ x: (cell % 3) * 100 + 50, y: Math.floor(cell / 3) * 100 + 50 });

	const marks = $derived(
		([0, 1] as Seat[]).flatMap((seat) =>
			board.marks[seat].map((cell) => ({
				seat,
				cell,
				...center(cell),
				fading: showFading && board.winner === null && fadingCell(board, seat) === cell
			}))
		)
	);

	const strike = $derived.by(() => {
		const line = showWin ? winningLine(board) : null;
		if (!line) return null;
		const a = center(line[0]!);
		const b = center(line[2]!);
		// Extend a little past the outer marks, like a real strike-through.
		const dx = (b.x - a.x) * 0.16;
		const dy = (b.y - a.y) * 0.16;
		return { x1: a.x - dx, y1: a.y - dy, x2: b.x + dx, y2: b.y + dy };
	});
</script>

<div class="relative aspect-square w-full select-none">
	<svg viewBox="0 0 300 300" class="absolute inset-0 h-full w-full" aria-hidden="true">
		<defs>
			<!-- Roughens stroke edges so lines read as chalk rather than vector. -->
			<filter id="{uid}-chalk" x="-5%" y="-5%" width="110%" height="110%">
				<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" />
				<feDisplacementMap in="SourceGraphic" scale="3" />
			</filter>
		</defs>

		<g
			filter="url(#{uid}-chalk)"
			fill="none"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<!-- The grid is a hash drawn by hand: four strokes, none quite straight. -->
			<g stroke="var(--color-chalk)" stroke-width="4.5" opacity="0.85">
				<path d="M100 10 C 97 100, 103 205, 100 291" />
				<path d="M200 9 C 203 95, 197 200, 201 290" />
				<path d="M9 100 C 100 103, 200 97, 291 101" />
				<path d="M10 200 C 95 197, 205 203, 290 199" />
			</g>

			{#each marks as mark (`${mark.seat}-${mark.cell}`)}
				<g
					stroke={mark.seat === 0 ? 'var(--color-x)' : 'var(--color-o)'}
					stroke-width="7"
					opacity={mark.fading ? 0.5 : 1}
					out:fade={{ duration: 260 }}
				>
					{#if mark.seat === 0}
						<path
							pathLength="1"
							class={mark.fading ? '' : 'stroke-draw'}
							stroke-dasharray={mark.fading ? '0.05 0.07' : undefined}
							d="M{mark.x - 25} {mark.y - 26} Q {mark.x + 3} {mark.y - 3} {mark.x + 26} {mark.y + 25}"
						/>
						<path
							pathLength="1"
							class={mark.fading ? '' : 'stroke-draw second'}
							stroke-dasharray={mark.fading ? '0.05 0.07' : undefined}
							d="M{mark.x + 25} {mark.y - 25} Q {mark.x - 3} {mark.y + 2} {mark.x - 26} {mark.y + 26}"
						/>
					{:else}
						<path
							pathLength="1"
							class={mark.fading ? '' : 'stroke-draw slow'}
							stroke-dasharray={mark.fading ? '0.035 0.045' : undefined}
							d="M{mark.x + 4} {mark.y - 28}
								C {mark.x - 34} {mark.y - 30}, {mark.x - 36} {mark.y + 30}, {mark.x} {mark.y + 28}
								C {mark.x + 36} {mark.y + 27}, {mark.x + 33} {mark.y - 32}, {mark.x - 3} {mark.y - 27}"
						/>
					{/if}
				</g>
			{/each}

			{#if strike}
				<line
					pathLength="1"
					class="stroke-draw slow"
					stroke="var(--color-chalk)"
					stroke-width="6"
					x1={strike.x1}
					y1={strike.y1}
					x2={strike.x2}
					y2={strike.y2}
				/>
			{/if}
		</g>
	</svg>

	<div class="absolute inset-0 grid grid-cols-3 grid-rows-3" role="group" aria-label={label}>
		{#each cells as cell (cell)}
			{@const owner = cellOwner(board, cell)}
			{@const fading = marks.some((m) => m.cell === cell && m.fading)}
			{@const open = canPlay !== null && owner === null}
			<button
				type="button"
				disabled={!open}
				onclick={() => onplay?.(cell)}
				aria-label="Row {Math.floor(cell / 3) + 1}, column {(cell % 3) + 1}: {owner === null
					? 'empty'
					: names[owner]}{fading ? ', vanishes next' : ''}"
				class="m-1.5 rounded-sm transition-colors {open
					? 'cursor-pointer hover:bg-white/[0.07]'
					: 'cursor-default'}"
			></button>
		{/each}
	</div>
</div>

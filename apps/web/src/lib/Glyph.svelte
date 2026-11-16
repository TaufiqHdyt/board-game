<script lang="ts">
	import type { Seat } from '@bg/game';

	interface Props {
		seat: Seat;
		size?: number;
		/** `mark` draws an X or O (Vanish); `dot` draws a plain chalk dot in the seat's colour. */
		shape?: 'mark' | 'dot';
	}

	let { seat, size = 22, shape = 'mark' }: Props = $props();
	const colour = $derived(seat === 0 ? 'var(--color-x)' : 'var(--color-o)');
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke={colour}
	stroke-width="3"
	stroke-linecap="round"
	aria-hidden="true"
	class="shrink-0"
>
	{#if shape === 'dot'}
		<circle cx="12" cy="12" r="6.5" fill={colour} stroke="none" />
	{:else if seat === 0}
		<path d="M5 5 Q 12 11 19 19 M19 5 Q 12 12 5 19" />
	{:else}
		<path d="M12.5 4 C 3 4, 3 20, 12 20 C 21 20, 21 4, 11.5 4.2" />
	{/if}
</svg>

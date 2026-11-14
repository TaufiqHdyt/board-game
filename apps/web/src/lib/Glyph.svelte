<script lang="ts">
	import type { Seat } from '@bg/game';

	let { seat, size = 22 }: { seat: Seat; size?: number } = $props();
</script>

<!-- A small X or O in the player's chalk colour. -->
<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke={seat === 0 ? 'var(--color-x)' : 'var(--color-o)'}
	stroke-width="3"
	stroke-linecap="round"
	aria-hidden="true"
	class="shrink-0"
>
	{#if seat === 0}
		<path d="M5 5 Q 12 11 19 19 M19 5 Q 12 12 5 19" />
	{:else}
		<path d="M12.5 4 C 3 4, 3 20, 12 20 C 21 20, 21 4, 11.5 4.2" />
	{/if}
</svg>

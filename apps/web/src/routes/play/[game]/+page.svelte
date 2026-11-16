<script lang="ts">
	import { goto } from '$app/navigation';
	import { QueueServerMsg } from '@bg/proto';
	import { onMount } from 'svelte';
	import { getGame } from '@bg/game';
	import { openSocket } from '#lib/socket.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const def = $derived(getGame(data.game));

	let waiting = $state<number | null>(null);
	let seconds = $state(0);
	let status = $state<'searching' | 'elsewhere' | 'matched'>('searching');

	onMount(() => {
		const started = Date.now();
		const ws = openSocket({ kind: 'queue', game: data.game });

		ws.addEventListener('message', (event) => {
			let parsed;
			try {
				parsed = QueueServerMsg.safeParse(JSON.parse(String(event.data)));
			} catch {
				return;
			}
			if (!parsed.success) return;
			if (parsed.data.type === 'queued') {
				waiting = parsed.data.waiting;
			} else {
				status = 'matched';
				ws.close();
				goto(`/room/${parsed.data.game}/${parsed.data.roomId}`);
			}
		});
		ws.addEventListener('close', (event) => {
			if (event.code === 4000) {
				status = 'elsewhere';
				ws.close();
			}
		});

		const timer = setInterval(() => (seconds = Math.floor((Date.now() - started) / 1000)), 500);
		return () => {
			clearInterval(timer);
			ws.close();
		};
	});
</script>

<div class="mx-auto max-w-md pt-10 text-center">
	{#if status === 'elsewhere'}
		<h1 class="font-hand text-4xl">Searching in another tab</h1>
		<p class="mt-3 text-dust">You can only wait in the queue once. Close the other tab to search here.</p>
	{:else if status === 'matched'}
		<h1 class="font-hand text-4xl" role="status">Opponent found</h1>
	{:else}
		<h1 class="font-hand text-4xl" role="status">Finding a {def.name} opponent</h1>
		<p class="mt-4 font-hand text-7xl leading-none tabular-nums" aria-label="{seconds} seconds waited">
			{seconds}<span class="text-3xl text-dust">s</span>
		</p>
		<p class="mx-auto mt-5 max-w-[32ch] text-dust">
			{#if waiting !== null && waiting > 1}
				{waiting} players are waiting. The rating range widens the longer you wait.
			{:else}
				We look near your rating first, then widen the range the longer you wait.
			{/if}
		</p>
	{/if}
	<a href="/" class="btn btn-quiet mt-8">Cancel</a>
</div>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { QueueServerMsg } from '@bg/proto';
	import { onMount } from 'svelte';
	import { openSocket } from '#lib/socket.ts';

	let waiting = $state<number | null>(null);
	let seconds = $state(0);
	let status = $state<'searching' | 'elsewhere' | 'matched'>('searching');

	onMount(() => {
		const started = Date.now();
		const ws = openSocket({ kind: 'queue' });

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
				goto(`/room/${parsed.data.roomId}`);
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

<div class="rounded-xl border border-line bg-panel p-8 text-center">
	{#if status === 'elsewhere'}
		<h1 class="text-xl font-semibold">Searching in another tab</h1>
		<p class="mt-2 text-zinc-400">You can only be in the queue once.</p>
	{:else if status === 'matched'}
		<h1 class="text-xl font-semibold" role="status">Opponent found</h1>
	{:else}
		<h1 class="text-xl font-semibold" role="status">Finding an opponent…</h1>
		<p class="mt-2 tabular-nums text-zinc-400">
			{seconds}s
			{#if waiting !== null && waiting > 1}· {waiting} players waiting{/if}
		</p>
		<p class="mx-auto mt-4 max-w-sm text-sm text-zinc-500">
			We look for someone near your rating first, then widen the search the longer you wait.
		</p>
	{/if}
	<a href="/" class="mt-6 inline-block rounded-lg border border-line px-4 py-2 text-sm hover:bg-ink">
		Cancel
	</a>
</div>

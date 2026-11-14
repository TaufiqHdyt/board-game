<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.player);
</script>

<section class="py-6">
	<h1 class="text-3xl font-semibold tracking-tight">Three marks each. No draws.</h1>
	<p class="mt-3 max-w-prose text-zinc-400">
		Place a fourth mark and your oldest one vanishes, so the board never fills and every match has
		a winner. You get 15 seconds per move and two minutes in total.
	</p>

	<div class="mt-6 flex flex-wrap gap-3">
		<a
			href="/play"
			class="rounded-lg bg-x px-5 py-2.5 font-medium text-ink hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-x"
		>
			Play ranked
		</a>
		<form method="POST" action="?/room">
			<button
				class="rounded-lg border border-line px-5 py-2.5 font-medium hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
			>
				Play a friend
			</button>
		</form>
	</div>
</section>

<section class="mt-4 rounded-xl border border-line bg-panel p-5">
	<h2 class="text-sm font-medium text-zinc-400">Your profile</h2>
	<dl class="mt-3 grid grid-cols-4 gap-3 text-center">
		<div>
			<dt class="text-xs text-zinc-500">Rating</dt>
			<dd class="text-xl font-semibold tabular-nums">{p.mmr}</dd>
		</div>
		<div>
			<dt class="text-xs text-zinc-500">Ranked games</dt>
			<dd class="text-xl font-semibold tabular-nums">{p.games}</dd>
		</div>
		<div>
			<dt class="text-xs text-zinc-500">Wins</dt>
			<dd class="text-xl font-semibold tabular-nums">{p.wins}</dd>
		</div>
		<div>
			<dt class="text-xs text-zinc-500">Losses</dt>
			<dd class="text-xl font-semibold tabular-nums">{p.losses}</dd>
		</div>
	</dl>

	<form method="POST" action="?/rename" use:enhance class="mt-5 flex flex-wrap items-end gap-3">
		<label class="flex-1 text-sm">
			<span class="text-zinc-400">Display name</span>
			<input
				name="name"
				value={form?.name ?? p.name}
				minlength="2"
				maxlength="20"
				required
				autocomplete="nickname"
				class="mt-1 block w-full rounded-md border border-line bg-ink px-3 py-2 focus-visible:outline-2 focus-visible:outline-x"
			/>
		</label>
		<button class="rounded-md border border-line px-4 py-2 text-sm hover:bg-ink">Save name</button>
		{#if form?.message}
			<p class="w-full text-sm text-zinc-400" role="status">{form.message}</p>
		{/if}
	</form>
</section>

<script lang="ts">
	import { enhance } from '$app/forms';
	import Demo from '#lib/Demo.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.player);
</script>

<section class="grid items-center gap-x-12 gap-y-8 pt-4 sm:grid-cols-[1fr_minmax(0,16rem)] sm:pt-10">
	<div>
		<h1 class="font-hand text-[clamp(2.7rem,7.4vw,3.6rem)] whitespace-nowrap leading-[0.95]">
			Three marks each.<br />Nobody draws.
		</h1>
		<p class="mt-5 max-w-[34ch] text-lg leading-relaxed text-dust">
			Place a fourth mark and your oldest is rubbed out. The board never fills, so someone always
			wins.
		</p>

		<div class="mt-7 flex flex-wrap gap-3">
			<a href="/play" class="btn btn-solid">Play ranked</a>
			<form method="POST" action="?/room">
				<button class="btn btn-line">Play a friend</button>
			</form>
		</div>
		<p class="mt-4 text-sm text-dust">15 seconds a move, two minutes each for the whole game.</p>
	</div>

	<div class="mx-auto w-full max-w-[17rem]">
		<Demo />
	</div>
</section>

<section class="rule mt-12 border-t pt-8">
	<h2 class="font-hand text-3xl">Your record</h2>

	<dl class="mt-4 flex flex-wrap gap-x-10 gap-y-4">
		<div>
			<dt class="text-sm text-dust">Rating</dt>
			<dd class="font-hand text-5xl leading-none tabular-nums">{p.mmr}</dd>
		</div>
		<div>
			<dt class="text-sm text-dust">Won</dt>
			<dd class="font-hand text-5xl leading-none tabular-nums text-x">{p.wins}</dd>
		</div>
		<div>
			<dt class="text-sm text-dust">Lost</dt>
			<dd class="font-hand text-5xl leading-none tabular-nums text-o">{p.losses}</dd>
		</div>
	</dl>
	{#if p.games === 0}
		<p class="mt-3 text-sm text-dust">Everyone starts at 1000. Only ranked games move it.</p>
	{/if}

	<form method="POST" action="?/rename" use:enhance class="mt-8 max-w-md">
		<label for="name" class="text-sm text-dust">Name shown to opponents</label>
		<div class="mt-1.5 flex gap-3">
			<input
				id="name"
				name="name"
				value={form?.name ?? p.name}
				minlength="2"
				maxlength="20"
				required
				autocomplete="nickname"
				class="min-w-0 flex-1 rounded-[4px] border-2 border-chalk/30 bg-slate-deep px-3 py-2 focus:border-chalk"
			/>
			<button class="btn btn-line !py-2">Save name</button>
		</div>
		{#if form?.message}
			<p class="mt-2 text-sm text-dust" role="status">{form.message}</p>
		{/if}
	</form>
</section>

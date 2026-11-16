<script lang="ts">
	import { enhance } from '$app/forms';
	import { getGame, type CongklakState } from '@bg/game';
	import CongklakBoard from '#lib/CongklakBoard.svelte';
	import Demo from '#lib/Demo.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// A middle-of-the-game position, so the board on the lobby is not a blank grid.
	const sample: CongklakState = {
		holes: [
			[3, 0, 9, 1, 0, 8, 2],
			[0, 10, 2, 0, 7, 1, 9]
		],
		stores: [24, 22],
		turn: 0,
		over: false,
		winner: null,
		moveCount: 12
	};

	const facts = {
		vanish: '15 seconds a move, two minutes each. Games take about a minute.',
		congklak: '20 seconds a move, five minutes each. 98 seeds; 49 each is a draw.'
	} as const;
</script>

<h1 class="pt-4 font-hand text-[clamp(2.7rem,7.4vw,3.6rem)] leading-none sm:pt-8">Pick a game.</h1>
<p class="mt-3 max-w-[44ch] text-lg text-dust">
	Play a stranger near your rating, or send a friend a link. Each game keeps its own rating.
</p>

{#each data.games as entry (entry.id)}
	{@const def = getGame(entry.id)}
	{@const r = entry.record}
	<section
		class="rule mt-10 grid items-center gap-x-12 gap-y-7 border-t pt-9 {entry.id === 'vanish'
			? 'sm:grid-cols-[1fr_minmax(0,15rem)]'
			: 'sm:grid-cols-[1fr_minmax(0,22rem)]'}"
		aria-labelledby="game-{entry.id}"
	>
		<div>
			<h2 id="game-{entry.id}" class="font-hand text-5xl leading-none">{def.name}</h2>
			<p class="mt-3 max-w-[36ch] text-lg leading-relaxed">{def.pitch}</p>
			<p class="mt-2 text-sm text-dust">{facts[entry.id]}</p>

			<div class="mt-6 flex flex-wrap gap-3">
				<a href="/play/{entry.id}" class="btn btn-solid">Play ranked</a>
				<form method="POST" action="?/room">
					<input type="hidden" name="game" value={entry.id} />
					<button class="btn btn-line" aria-label="Play a friend at {def.name}">Play a friend</button>
				</form>
			</div>

			<p class="mt-5 text-dust">
				{#if r.games === 0}
					You start at <span class="font-hand text-2xl text-chalk tabular-nums">{r.mmr}</span>. Ranked
					games move it.
				{:else}
					Your rating is <span class="font-hand text-2xl text-chalk tabular-nums">{r.mmr}</span>
					<span class="whitespace-nowrap">
						after {r.wins} won, {r.losses} lost{#if def.canDraw}, {r.draws} drawn{/if}.
					</span>
				{/if}
			</p>
		</div>

		<div class="mx-auto w-full {entry.id === 'vanish' ? 'max-w-[15rem]' : 'max-w-[22rem]'}">
			{#if entry.id === 'vanish'}
				<Demo />
			{:else}
				<div aria-hidden="true" inert>
					<CongklakBoard state={sample} you={0} />
				</div>
			{/if}
		</div>
	</section>
{/each}

<section class="rule mt-12 border-t pt-8">
	<form method="POST" action="?/rename" use:enhance class="max-w-md">
		<label for="name" class="text-sm text-dust">Name shown to opponents</label>
		<div class="mt-1.5 flex gap-3">
			<input
				id="name"
				name="name"
				value={form?.name ?? data.name}
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

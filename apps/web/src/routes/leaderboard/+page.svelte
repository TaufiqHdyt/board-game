<script lang="ts">
	import { GAME_IDS, getGame } from '@bg/game';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const def = $derived(getGame(data.game));
</script>

<h1 class="pt-4 font-hand text-5xl leading-none">Leaderboard</h1>

<nav class="mt-4 flex gap-5" aria-label="Game">
	{#each GAME_IDS as id (id)}
		<a
			href="/leaderboard?game={id}"
			aria-current={id === data.game ? 'page' : undefined}
			class="border-b-2 pb-0.5 font-hand text-2xl {id === data.game
				? 'border-chalk text-chalk'
				: 'border-transparent text-dust hover:text-chalk'}"
		>
			{getGame(id).name}
		</a>
	{/each}
</nav>

{#if data.rows.length === 0}
	<p class="mt-6 max-w-[40ch] text-dust">Nobody has finished a ranked game of {def.name} yet.</p>
	<a href="/play/{data.game}" class="btn btn-solid mt-5">Play the first one</a>
{:else}
	<p class="mt-4 text-sm text-dust">The top 100 by rating, refreshed about once a minute.</p>
	<table class="mt-4 w-full">
		<thead class="text-left text-sm text-dust">
			<tr class="rule border-b">
				<th scope="col" class="w-12 py-2 font-medium">Rank</th>
				<th scope="col" class="py-2 pl-3 font-medium">Player</th>
				<th scope="col" class="py-2 text-right font-medium">Rating</th>
				<th scope="col" class="w-14 py-2 text-right font-medium">Won</th>
				{#if def.canDraw}
					<th scope="col" class="w-14 py-2 text-right font-medium">Drawn</th>
				{/if}
				<th scope="col" class="w-14 py-2 text-right font-medium">Lost</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as row, i (i)}
				<tr class="rule border-b {row.me ? 'bg-white/[0.06]' : ''}">
					<td class="py-2.5 pl-1 font-hand text-3xl leading-none tabular-nums {i < 3 ? 'text-x' : 'text-dust'}">
						{i + 1}
					</td>
					<td class="py-2.5 pl-3 text-lg font-semibold">
						{row.name}{#if row.me}<span class="ml-1.5 font-normal text-dust">(you)</span>{/if}
					</td>
					<td class="py-2.5 text-right font-hand text-3xl leading-none tabular-nums">{row.mmr}</td>
					<td class="py-2.5 text-right tabular-nums text-dust">{row.wins}</td>
					{#if def.canDraw}
						<td class="py-2.5 text-right tabular-nums text-dust">{row.draws}</td>
					{/if}
					<td class="py-2.5 pr-1 text-right tabular-nums text-dust">{row.losses}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

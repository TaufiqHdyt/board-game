<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1 class="pt-4 font-hand text-5xl leading-none">Leaderboard</h1>

{#if data.rows.length === 0}
	<p class="mt-5 max-w-[40ch] text-dust">Nobody has finished a ranked game yet.</p>
	<a href="/play" class="btn btn-solid mt-5">Play the first one</a>
{:else}
	<p class="mt-2 text-sm text-dust">The top 100 by rating, refreshed about once a minute.</p>
	<table class="mt-6 w-full">
		<thead class="text-left text-sm text-dust">
			<tr class="rule border-b">
				<th scope="col" class="w-12 py-2 font-medium">Rank</th>
				<th scope="col" class="py-2 pl-3 font-medium">Player</th>
				<th scope="col" class="py-2 text-right font-medium">Rating</th>
				<th scope="col" class="w-16 py-2 text-right font-medium">Won</th>
				<th scope="col" class="w-16 py-2 text-right font-medium">Lost</th>
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
					<td class="py-2.5 pr-1 text-right tabular-nums text-dust">{row.losses}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

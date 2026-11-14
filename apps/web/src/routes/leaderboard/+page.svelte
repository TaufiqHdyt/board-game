<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1 class="py-4 text-2xl font-semibold tracking-tight">Leaderboard</h1>

{#if data.rows.length === 0}
	<p class="rounded-xl border border-line bg-panel p-6 text-zinc-400">
		No ranked games yet. <a href="/play" class="text-x underline">Play the first one.</a>
	</p>
{:else}
	<div class="overflow-hidden rounded-xl border border-line">
		<table class="w-full text-sm">
			<thead class="bg-panel text-left text-xs text-zinc-400">
				<tr>
					<th scope="col" class="px-4 py-2.5 font-medium">#</th>
					<th scope="col" class="px-4 py-2.5 font-medium">Player</th>
					<th scope="col" class="px-4 py-2.5 text-right font-medium">Rating</th>
					<th scope="col" class="px-4 py-2.5 text-right font-medium">W</th>
					<th scope="col" class="px-4 py-2.5 text-right font-medium">L</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row, i (i)}
					<tr class="border-t border-line {row.me ? 'bg-panel' : ''}">
						<td class="px-4 py-2.5 tabular-nums text-zinc-500">{i + 1}</td>
						<td class="px-4 py-2.5 font-medium">{row.name}{row.me ? ' (you)' : ''}</td>
						<td class="px-4 py-2.5 text-right tabular-nums">{row.mmr}</td>
						<td class="px-4 py-2.5 text-right tabular-nums text-zinc-400">{row.wins}</td>
						<td class="px-4 py-2.5 text-right tabular-nums text-zinc-400">{row.losses}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-3 text-xs text-zinc-500">Top 100 by rating. Updates about once a minute.</p>
{/if}

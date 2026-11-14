<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const reasons = { line: 'three in a line', timeout: 'on time', resign: 'by resignation' } as const;
	const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<h1 class="py-4 text-2xl font-semibold tracking-tight">Your matches</h1>

{#if data.matches.length === 0}
	<p class="rounded-xl border border-line bg-panel p-6 text-zinc-400">
		Nothing here yet. Finished matches appear a few seconds after they end.
	</p>
{:else}
	<ul class="space-y-2">
		{#each data.matches as match (match.id)}
			<li class="flex items-center justify-between gap-4 rounded-xl border border-line bg-panel px-4 py-3">
				<div class="min-w-0">
					<p class="truncate font-medium">
						<span class={match.won ? 'text-x' : 'text-o'}>{match.won ? 'Won' : 'Lost'}</span>
						vs {match.opponent}
					</p>
					<p class="text-xs text-zinc-500">
						{reasons[match.reason]} · {match.moveCount} moves · played {match.symbol} ·
						{date.format(match.endedAt)}
					</p>
				</div>
				<p class="shrink-0 text-sm tabular-nums text-zinc-400">
					{#if match.ranked}
						{match.ratingChange >= 0 ? '+' : ''}{match.ratingChange}
					{:else}
						unranked
					{/if}
				</p>
			</li>
		{/each}
	</ul>
{/if}

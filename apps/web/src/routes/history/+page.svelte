<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const reasons = {
		line: 'Three in a line',
		timeout: 'On time',
		resign: 'By resignation'
	} as const;
	const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<h1 class="pt-4 font-hand text-5xl leading-none">Your games</h1>

{#if data.matches.length === 0}
	<p class="mt-5 max-w-[40ch] text-dust">
		No finished games yet. They show up here a few seconds after they end.
	</p>
	<a href="/play" class="btn btn-solid mt-5">Play ranked</a>
{:else}
	<ul class="mt-6">
		{#each data.matches as match (match.id)}
			<li class="rule flex items-center gap-4 border-b py-3">
				<p class="w-16 shrink-0 font-hand text-3xl leading-none {match.won ? 'text-x' : 'text-o'}">
					{match.won ? 'Won' : 'Lost'}
				</p>
				<div class="min-w-0 flex-1">
					<p class="truncate text-lg font-semibold">against {match.opponent}</p>
					<p class="text-sm text-dust">
						{reasons[match.reason]} after {match.moveCount} moves, playing {match.symbol}.
						<span class="whitespace-nowrap">{date.format(match.endedAt)}</span>
					</p>
				</div>
				<p class="shrink-0 text-right">
					{#if match.ranked}
						<span class="font-hand text-3xl leading-none tabular-nums">
							{match.ratingChange >= 0 ? '+' : '−'}{Math.abs(match.ratingChange)}
						</span>
					{:else}
						<span class="text-sm text-dust">friendly</span>
					{/if}
				</p>
			</li>
		{/each}
	</ul>
{/if}

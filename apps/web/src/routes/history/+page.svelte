<script lang="ts">
	import { getGame } from '@bg/game';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const labels = { won: 'Won', lost: 'Lost', drawn: 'Drew' } as const;
	const colours = { won: 'text-x', lost: 'text-o', drawn: 'text-chalk' } as const;
	const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	type Match = (typeof data.matches)[number];

	function detail(match: Match): string {
		switch (match.reason) {
			case 'line':
				return `Three in a line after ${match.moveCount} moves, playing ${match.symbol}.`;
			case 'score':
				return match.score ? `${match.score[0]} seeds to ${match.score[1]}.` : 'Played to the end.';
			case 'timeout':
				return `On time after ${match.moveCount} moves.`;
			case 'resign':
				return `By resignation after ${match.moveCount} moves.`;
		}
	}
</script>

<h1 class="pt-4 font-hand text-5xl leading-none">Your games</h1>

{#if data.matches.length === 0}
	<p class="mt-5 max-w-[40ch] text-dust">
		No finished games yet. They show up here a few seconds after they end.
	</p>
	<a href="/" class="btn btn-solid mt-5">Pick a game</a>
{:else}
	<ul class="mt-6">
		{#each data.matches as match (match.id)}
			<li class="rule flex items-center gap-4 border-b py-3">
				<p class="w-16 shrink-0 font-hand text-3xl leading-none {colours[match.result]}">
					{labels[match.result]}
				</p>
				<div class="min-w-0 flex-1">
					<p class="truncate text-lg font-semibold">
						{getGame(match.game).name} against {match.opponent}
					</p>
					<p class="text-sm text-dust">
						{detail(match)}
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

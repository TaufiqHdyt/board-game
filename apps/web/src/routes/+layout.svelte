<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'Play' },
		{ href: '/leaderboard', label: 'Leaderboard' },
		{ href: '/history', label: 'History' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Vanish — tic-tac-toe that never ties</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-2xl flex-col px-4">
	<header class="flex items-center justify-between gap-4 py-5">
		<a href="/" class="text-lg font-semibold tracking-tight">
			<span class="text-x">✕</span><span class="text-o">◯</span> Vanish
		</a>
		<nav class="flex items-center gap-1 text-sm">
			{#each links as link (link.href)}
				<a
					href={link.href}
					aria-current={page.url.pathname === link.href ? 'page' : undefined}
					class="rounded-md px-3 py-1.5 text-zinc-400 hover:text-white aria-[current=page]:bg-panel aria-[current=page]:text-white"
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</header>

	<main class="flex-1 pb-12">
		{@render children()}
	</main>

	<footer class="border-t border-line py-4 text-xs text-zinc-500">
		Playing as {data.me.name}
	</footer>
</div>

<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import Glyph from '#lib/Glyph.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'Play' },
		{ href: '/leaderboard', label: 'Leaderboard' },
		{ href: '/history', label: 'History' }
	];
</script>

<svelte:head>
	<title>Vanish: tic-tac-toe that never ties</title>
	<meta name="theme-color" content="#1f3832" />
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-3xl flex-col px-5">
	<header class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5">
		<a href="/" class="flex items-center gap-1.5 font-hand text-3xl leading-none">
			<Glyph seat={0} size={20} /><Glyph seat={1} size={20} />
			<span class="ml-1">Vanish</span>
		</a>
		<nav class="flex items-center gap-5 text-[0.95rem]" aria-label="Main">
			{#each links as link (link.href)}
				{@const current = page.url.pathname === link.href}
				<a
					href={link.href}
					aria-current={current ? 'page' : undefined}
					class="border-b-2 pb-0.5 {current
						? 'border-chalk text-chalk'
						: 'border-transparent text-dust hover:text-chalk'}"
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</header>

	<main class="flex-1 pb-14">
		{@render children()}
	</main>

	<footer class="rule border-t py-4 text-sm text-dust">
		Playing as <span class="text-chalk">{data.me.name}</span>
	</footer>
</div>

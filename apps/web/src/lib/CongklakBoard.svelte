<script lang="ts">
	import {
		HOLES,
		isStore,
		ringOf,
		sideOf,
		sow,
		sowDuration,
		storePos,
		type CongklakState,
		type Seat,
		type SowEvent
	} from '@bg/game';
	import { onDestroy, untrack } from 'svelte';

	interface Props {
		state: CongklakState;
		/** The viewer's seat: their row is at the bottom, their store on their left. */
		you: Seat;
		/** The move that produced `state`; it is replayed seed by seed. */
		lastMove?: { seat: Seat; move: number } | null;
		canPlay?: boolean;
		onplay?: (hole: number) => void;
		/** Called when a replay starts or stops, so the parent can hold its status line. */
		onbusy?: (busy: boolean) => void;
	}

	let { state: actual, you, lastMove = null, canPlay = false, onplay, onbusy }: Props = $props();

	const uid = $props.id();
	const them: Seat = $derived(you === 0 ? 1 : 0);

	// What is drawn. During a replay this lags behind `actual`.
	let shown = $state<{ holes: [number[], number[]]; stores: [number, number] }>(
		untrack(() => snapshot(actual))
	);
	let hand = $state(0);
	let activePos = $state<number | null>(null);
	let replaying = $state(false);
	let note = $state('');

	let previous: CongklakState | null = null;
	let timers: ReturnType<typeof setTimeout>[] = [];

	function snapshot(s: CongklakState) {
		return {
			holes: [[...s.holes[0]], [...s.holes[1]]] as [number[], number[]],
			stores: [...s.stores] as [number, number]
		};
	}

	function stop() {
		timers.forEach(clearTimeout);
		timers = [];
		hand = 0;
		activePos = null;
		if (replaying) {
			replaying = false;
			onbusy?.(false);
		}
	}

	function settle() {
		stop();
		shown = snapshot(actual);
	}

	function add(pos: number, amount: number) {
		const seat = sideOf(pos);
		if (isStore(pos)) shown.stores[seat] += amount;
		else shown.holes[seat][pos % (HOLES + 1)]! += amount;
	}
	function clear(pos: number) {
		shown.holes[sideOf(pos)][pos % (HOLES + 1)] = 0;
	}

	function describe(events: SowEvent[], mover: Seat, extraTurn: boolean): string {
		const who = mover === you ? 'You' : 'They';
		const capture = events.find((e) => e.type === 'capture');
		const parts: string[] = [];
		if (capture) parts.push(`${who} captured ${capture.count}.`);
		if (extraTurn && !actual.over) {
			parts.push(mover === you ? 'Last seed in your store: go again.' : 'Last seed in their store: they go again.');
		}
		return parts.join(' ');
	}

	function replay(from: CongklakState, mover: Seat, hole: number) {
		const result = sow(from, mover, hole);
		if (!result.ok) return settle();

		stop();
		shown = snapshot(from);
		replaying = true;
		onbusy?.(true);
		note = '';

		const stepMs = sowDuration(result.drops) / Math.max(1, result.drops);
		let at = 0;
		for (const event of result.events) {
			if (event.type === 'drop') at += stepMs;
			else if (event.type !== 'pick') at += 350;
			timers.push(
				setTimeout(() => {
					if (event.type === 'pick') {
						clear(event.pos);
						hand = event.count;
						activePos = event.pos;
					} else if (event.type === 'drop') {
						add(event.pos, 1);
						hand -= 1;
						activePos = event.pos;
					} else if (event.type === 'capture') {
						event.from.forEach(clear);
						add(storePos(mover), event.count);
						activePos = storePos(mover);
					} else {
						shown.holes[event.seat] = Array(HOLES).fill(0);
						add(storePos(event.seat), event.count);
					}
				}, at)
			);
		}
		timers.push(
			setTimeout(() => {
				settle();
				note = describe(result.events, mover, result.extraTurn);
			}, at + 250)
		);
	}

	$effect(() => {
		const next = actual;
		const move = lastMove;
		untrack(() => {
			const from = previous;
			previous = next;
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (from && move && next.moveCount === from.moveCount + 1) {
				if (reduced) {
					settle();
					const result = sow(from, move.seat, move.move);
					note = result.ok ? describe(result.events, move.seat, result.extraTurn) : '';
				} else {
					replay(from, move.seat, move.move);
				}
			} else {
				settle();
				note = '';
			}
		});
	});

	onDestroy(stop);

	// ---- Geometry: nine columns (store, seven holes, store) and two rows. ----
	const COL = 80;
	const W = COL * 9;
	const H = 300;
	const TOP = 92;
	const BOTTOM = 208;

	function xy(pos: number): { x: number; y: number } {
		const mine = sideOf(pos) === you;
		const index = pos % (HOLES + 1);
		if (isStore(pos)) return { x: mine ? COL / 2 : W - COL / 2, y: H / 2 };
		// Sowing is clockwise: leftwards along the bottom row, rightwards along the top.
		return mine
			? { x: COL * (1 + (HOLES - 1 - index)) + COL / 2, y: BOTTOM }
			: { x: COL * (1 + index) + COL / 2, y: TOP };
	}

	/** Seeds scattered in a sunflower pattern so piles look hand-dropped but stay put. */
	function seeds(count: number, rx: number, ry: number, max: number) {
		const n = Math.min(count, max);
		return Array.from({ length: n }, (_, k) => {
			const r = Math.sqrt((k + 0.5) / max);
			const angle = k * 2.399963;
			return { x: rx * r * Math.cos(angle), y: ry * r * Math.sin(angle) };
		});
	}

	const colour = (seat: Seat) => (seat === 0 ? 'var(--color-x)' : 'var(--color-o)');

	const holes = $derived(
		([0, 1] as Seat[]).flatMap((seat) =>
			Array.from({ length: HOLES }, (_, hole) => {
				const pos = ringOf(seat, hole);
				return { seat, hole, pos, ...xy(pos), count: shown.holes[seat][hole] ?? 0 };
			})
		)
	);
	const stores = $derived(
		([0, 1] as Seat[]).map((seat) => ({
			seat,
			pos: storePos(seat),
			...xy(storePos(seat)),
			count: shown.stores[seat]
		}))
	);
	const open = $derived(canPlay && !replaying && !actual.over && actual.turn === you);
</script>

<div>
	<div class="relative w-full select-none" style="aspect-ratio: {W} / {H}">
		<svg viewBox="0 0 {W} {H}" class="absolute inset-0 h-full w-full" aria-hidden="true">
			<defs>
				<filter id="{uid}-chalk" x="-5%" y="-5%" width="110%" height="110%">
					<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" />
					<feDisplacementMap in="SourceGraphic" scale="3" />
				</filter>
			</defs>

			<g filter="url(#{uid}-chalk)" fill="none" stroke-linecap="round">
				{#each stores as store (store.pos)}
					<ellipse
						cx={store.x}
						cy={store.y}
						rx="30"
						ry="100"
						stroke={colour(store.seat)}
						stroke-width={activePos === store.pos ? 6 : 4}
					/>
				{/each}
				{#each holes as hole (hole.pos)}
					{@const playable = open && hole.seat === you && hole.count > 0}
					<circle
						cx={hole.x}
						cy={hole.y}
						r="31"
						stroke={activePos === hole.pos ? 'var(--color-chalk)' : colour(hole.seat)}
						stroke-width={activePos === hole.pos ? 6 : playable ? 5 : 3.5}
						opacity={playable || activePos === hole.pos || replaying ? 1 : hole.seat === you && open ? 0.4 : 0.8}
					/>
				{/each}
			</g>

			<g fill="var(--color-chalk)">
				{#each stores as store (store.pos)}
					{#each seeds(store.count, 19, 84, 60) as seed, k (k)}
						<circle cx={store.x + seed.x} cy={store.y + seed.y} r="3.4" />
					{/each}
				{/each}
				{#each holes as hole (hole.pos)}
					{#each seeds(hole.count, 22, 22, 20) as seed, k (k)}
						<circle cx={hole.x + seed.x} cy={hole.y + seed.y} r="3.4" />
					{/each}
				{/each}
			</g>

			<g
				text-anchor="middle"
				font-family="var(--font-hand)"
				style="font-variant-numeric: tabular-nums"
			>
				{#each holes as hole (hole.pos)}
					<text
						x={hole.x}
						y={hole.seat === you ? hole.y + 62 : hole.y - 42}
						font-size="30"
						fill={hole.count === 0 ? 'var(--color-dust)' : 'var(--color-chalk)'}
						opacity={hole.count === 0 ? 0.6 : 1}
					>
						{hole.count}
					</text>
				{/each}
				{#each stores as store (store.pos)}
					<text x={store.x} y="38" font-size="40" fill={colour(store.seat)}>{store.count}</text>
				{/each}
			</g>
		</svg>

		<!-- Real buttons over the viewer's own holes. Numbered in sowing order. -->
		<div class="absolute inset-0" role="group" aria-label="Your holes">
			{#each holes.filter((h) => h.seat === you) as hole (hole.pos)}
				<button
					type="button"
					disabled={!open || hole.count === 0}
					onclick={() => onplay?.(hole.hole)}
					aria-label="Hole {hole.hole + 1}: {hole.count} {hole.count === 1 ? 'seed' : 'seeds'}"
					class="absolute rounded-md transition-colors {open && hole.count > 0
						? 'cursor-pointer hover:bg-white/[0.08]'
						: 'cursor-default'}"
					style="left: {((hole.x - COL / 2) / W) * 100}%; top: {((BOTTOM - 44) / H) * 100}%;
						width: {(COL / W) * 100}%; height: {(124 / H) * 100}%"
				></button>
			{/each}
		</div>
	</div>

	<p class="sr-only">
		Your store has {shown.stores[you]} seeds, the opponent's store has {shown.stores[them]}. Opponent's
		holes, in their sowing order: {shown.holes[them].join(', ')}.
	</p>

	<div class="mt-1 flex min-h-8 items-center justify-center gap-3 text-sm text-dust">
		{#if replaying}
			<span aria-hidden="true">Sowing{hand > 0 ? `, ${hand} in hand` : ''}</span>
			<button type="button" class="btn btn-quiet !px-2 !py-1 underline" onclick={settle}>Skip</button>
		{:else if note}
			<span role="status">{note}</span>
		{/if}
	</div>
</div>

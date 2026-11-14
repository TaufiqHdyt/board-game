<script lang="ts">
	import { eloDelta, otherSeat, type Seat } from '@bg/game';
	import { RoomServerMsg, type ClientMsg, type RoomState } from '@bg/proto';
	import { onMount } from 'svelte';
	import Board from './Board.svelte';
	import Glyph from './Glyph.svelte';
	import { openSocket } from './socket';

	let { room }: { room: string } = $props();

	let game = $state<RoomState | null>(null);
	let link = $state<'connecting' | 'open' | 'lost' | 'replaced' | 'refused'>('connecting');
	let notice = $state('');
	let copied = $state(false);
	/** Server clock minus local clock, so countdowns agree with the referee. */
	let clockOffset = 0;
	let tick = $state(Date.now());
	let socket: ReturnType<typeof openSocket> | undefined;

	onMount(() => {
		let failures = 0;
		const ws = openSocket({ kind: 'room', room });
		socket = ws;

		ws.addEventListener('open', () => {
			failures = 0;
			link = 'open';
		});
		ws.addEventListener('message', (event) => {
			let parsed;
			try {
				parsed = RoomServerMsg.safeParse(JSON.parse(String(event.data)));
			} catch {
				return;
			}
			if (!parsed.success) return;
			if (parsed.data.type === 'error') {
				notice = describeError(parsed.data.message);
				return;
			}
			clockOffset = parsed.data.now - Date.now();
			tick = Date.now();
			game = parsed.data;
			notice = '';
		});
		ws.addEventListener('close', (event) => {
			if (event.code === 4000) {
				link = 'replaced';
				ws.close();
			} else if (link !== 'replaced' && link !== 'refused') {
				link = 'lost';
			}
		});
		ws.addEventListener('error', () => {
			// A handshake that keeps failing means the room refused us (full or gone).
			if (++failures >= 3 && !game) {
				link = 'refused';
				ws.close();
			}
		});

		const timer = setInterval(() => (tick = Date.now()), 100);
		return () => {
			clearInterval(timer);
			ws.close();
		};
	});

	function send(message: ClientMsg) {
		socket?.send(JSON.stringify(message));
	}

	function describeError(code: string): string {
		switch (code) {
			case 'occupied':
				return 'That square is taken.';
			case 'not_your_turn':
				return 'Wait for your turn.';
			case 'game_over':
				return 'The game is over.';
			default:
				return code;
		}
	}

	const playing = $derived(game?.status === 'playing');
	const myTurn = $derived(playing && game?.board.turn === game?.you);
	const elapsed = $derived(
		game && playing ? Math.max(0, tick + clockOffset - game.turnStartedAt) : 0
	);
	const moveLeft = $derived(
		game && playing ? Math.max(0, Math.min(game.moveMs, game.bank[game.board.turn]) - elapsed) : 0
	);
	const iWon = $derived(game?.status === 'ended' && game.board.winner === game.you);

	const ratingChange = $derived.by(() => {
		if (!game || game.status !== 'ended' || !game.ranked || game.board.winner === null) return null;
		const winner = game.players[game.board.winner];
		const loser = game.players[game.board.winner === 0 ? 1 : 0];
		if (!winner || !loser) return null;
		const delta = eloDelta(winner, loser);
		return iWon ? delta.winner : delta.loser;
	});

	function bankFor(seat: Seat): number {
		if (!game) return 0;
		const base = game.bank[seat];
		return playing && game.board.turn === seat ? Math.max(0, base - elapsed) : base;
	}

	function clock(ms: number): string {
		const total = Math.ceil(ms / 1000);
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	}

	function endText(state: RoomState): string {
		const won = state.board.winner === state.you;
		switch (state.reason) {
			case 'line':
				return won ? 'Three in a line.' : 'Your opponent made three in a line.';
			case 'timeout':
				return won ? 'Your opponent ran out of time.' : 'You ran out of time.';
			case 'resign':
				return won ? 'Your opponent resigned.' : 'You resigned.';
			default:
				return '';
		}
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(location.href);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			notice = 'Copy the address from your browser bar to share it.';
		}
	}
</script>

{#snippet playerRow(state: RoomState, seat: Seat)}
	{@const player = state.players[seat]}
	{@const active = state.status === 'playing' && state.board.turn === seat}
	{@const left = bankFor(seat)}
	<div class="py-2.5">
		<div class="flex items-center gap-3">
			<Glyph {seat} size={26} />
			<div class="min-w-0 flex-1">
				<p class="truncate text-lg leading-tight font-semibold">
					{player?.name}{#if seat === state.you}<span class="ml-1.5 font-normal text-dust">(you)</span>{/if}
				</p>
				<p class="text-sm text-dust">
					Rated {player?.mmr}
					{#if !state.connected[seat] && state.status === 'playing'}
						<span class="ml-2 text-warn">disconnected</span>
					{/if}
				</p>
			</div>
			<p
				class="font-hand text-4xl leading-none tabular-nums {active
					? left < 15000
						? 'text-warn'
						: 'text-chalk'
					: 'text-dust'}"
				aria-label="Time left for {player?.name}"
			>
				{clock(left)}
			</p>
		</div>
		<!-- The move timer: a chalk line under whoever is to move, rubbed away as time runs. -->
		<div class="mt-2 h-[3px]" aria-hidden="true">
			{#if active}
				<div
					class="h-full rounded-full {moveLeft < 5000 ? 'bg-warn' : seat === 0 ? 'bg-x' : 'bg-o'}"
					style="width: {(moveLeft / state.moveMs) * 100}%"
				></div>
			{/if}
		</div>
	</div>
{/snippet}

{#if link === 'replaced'}
	<div class="mx-auto max-w-md pt-10 text-center">
		<h1 class="font-hand text-4xl">Open in another tab</h1>
		<p class="mt-3 text-dust">This game moved to your other tab. Close it and reload to play here.</p>
	</div>
{:else if link === 'refused'}
	<div class="mx-auto max-w-md pt-10 text-center">
		<h1 class="font-hand text-4xl">This room is closed</h1>
		<p class="mt-3 text-dust">It already has two players, or the game ended a while ago.</p>
		<a href="/" class="btn btn-line mt-6">Back to the lobby</a>
	</div>
{:else if !game}
	<p class="pt-16 text-center font-hand text-3xl text-dust" role="status">Connecting…</p>
{:else if game.status === 'waiting'}
	<div class="mx-auto max-w-md pt-10 text-center">
		<h1 class="font-hand text-5xl leading-none">Waiting for your friend</h1>
		<p class="mx-auto mt-4 max-w-[30ch] text-dust">
			Send them the link to this page. The game starts as soon as they open it.
		</p>
		<button onclick={copyLink} class="btn btn-solid mt-7">
			{copied ? 'Link copied' : 'Copy invite link'}
		</button>
		{#if notice}<p class="mt-3 text-sm text-warn">{notice}</p>{/if}
		<p class="mt-6 text-sm text-dust">Games with friends don't change your rating.</p>
	</div>
{:else}
	{@const state = game}
	<div class="mx-auto max-w-[26rem]">
		{@render playerRow(state, otherSeat(state.you))}

		<div class="rule border-y py-3">
			<p class="min-h-9 text-center" role="status" aria-live="polite">
				{#if state.status === 'ended'}
					<span class="font-hand text-3xl leading-none {iWon ? 'text-x' : 'text-o'}">
						{iWon ? 'You won.' : 'You lost.'}
					</span>
					<span class="ml-1 text-dust">{endText(state)}</span>
				{:else if myTurn}
					<span class="font-hand text-3xl leading-none">Your move</span>
					<span class="ml-1 tabular-nums {moveLeft < 5000 ? 'text-warn' : 'text-dust'}">
						{Math.ceil(moveLeft / 1000)}s
					</span>
				{:else}
					<span class="text-dust">Waiting for {state.players[otherSeat(state.you)]?.name}</span>
				{/if}
			</p>

			<div class="mx-auto mt-1 max-w-[22rem]">
				<Board
					board={state.board}
					showWin={state.reason === 'line'}
					canPlay={myTurn ? state.you : null}
					onplay={(cell) => send({ type: 'move', cell })}
				/>
			</div>

			<p class="min-h-5 text-center text-sm text-dust">
				{#if notice}
					<span class="text-warn">{notice}</span>
				{:else if link === 'lost'}
					<span class="text-warn">Connection lost. Reconnecting…</span>
				{:else if playing && state.board.moveCount >= 5}
					A dotted mark is rubbed out on its owner's next move.
				{/if}
			</p>
		</div>

		{@render playerRow(state, state.you)}

		<div class="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
			{#if state.status === 'ended'}
				{#if ratingChange !== null}
					<p class="text-dust">
						Rating
						<span class="font-hand text-3xl tabular-nums {ratingChange >= 0 ? 'text-x' : 'text-o'}">
							{ratingChange >= 0 ? '+' : '−'}{Math.abs(ratingChange)}
						</span>
					</p>
				{/if}
				<a href={state.ranked ? '/play' : '/'} data-sveltekit-reload class="btn btn-solid">
					{state.ranked ? 'Play again' : 'Back to the lobby'}
				</a>
			{:else}
				<button type="button" onclick={() => send({ type: 'resign' })} class="btn btn-quiet">
					Resign
				</button>
			{/if}
		</div>
	</div>
{/if}

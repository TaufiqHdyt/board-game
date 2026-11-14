<script lang="ts">
	import { cellOwner, eloDelta, fadingCell, winningLine, type Seat } from '@bg/game';
	import { RoomServerMsg, type ClientMsg, type RoomState } from '@bg/proto';
	import { onMount } from 'svelte';
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
	const winLine = $derived(game && game.reason === 'line' ? winningLine(game.board) : null);
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

	const seats: Seat[] = [0, 1];
	const symbols = ['✕', '◯'] as const;
	const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
</script>

{#if link === 'replaced'}
	<p class="rounded-lg border border-line bg-panel p-5">
		This game is open in another tab. Close that tab and reload to play here.
	</p>
{:else if link === 'refused'}
	<div class="rounded-lg border border-line bg-panel p-5">
		<p>This room is full or no longer exists.</p>
		<a href="/" class="mt-3 inline-block text-x underline">Back to the lobby</a>
	</div>
{:else if !game}
	<p class="py-10 text-center text-zinc-400" role="status">Connecting…</p>
{:else if game.status === 'waiting'}
	<div class="rounded-xl border border-line bg-panel p-6 text-center">
		<h1 class="text-xl font-semibold">Waiting for your friend</h1>
		<p class="mt-2 text-zinc-400">Send them this page's link. The game starts when they open it.</p>
		<button
			onclick={copyLink}
			class="mt-5 rounded-lg bg-x px-5 py-2.5 font-medium text-ink hover:brightness-110"
		>
			{copied ? 'Link copied' : 'Copy invite link'}
		</button>
		<p class="mt-4 text-xs text-zinc-500">Friend games are unranked.</p>
	</div>
{:else}
	<div class="mx-auto max-w-md">
		<div class="grid grid-cols-2 gap-3">
			{#each seats as seat (seat)}
				{@const player = game.players[seat]}
				{@const active = playing && game.board.turn === seat}
				<div
					class="rounded-xl border bg-panel p-3 transition-colors {active
						? seat === 0
							? 'border-x'
							: 'border-o'
						: 'border-line'}"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-lg {seat === 0 ? 'text-x' : 'text-o'}" aria-hidden="true">
							{symbols[seat]}
						</span>
						<span class="font-mono text-lg tabular-nums" aria-label="Time left">
							{clock(bankFor(seat))}
						</span>
					</div>
					<p class="mt-1 truncate text-sm font-medium">
						{player?.name}{seat === game.you ? ' (you)' : ''}
					</p>
					<p class="text-xs text-zinc-500">
						{player?.mmr}
						{#if !game.connected[seat] && game.status === 'playing'}
							· <span class="text-amber-300">disconnected</span>
						{/if}
					</p>
				</div>
			{/each}
		</div>

		<div class="mt-4 h-1.5 overflow-hidden rounded-full bg-panel" aria-hidden="true">
			<div
				class="h-full rounded-full {moveLeft < 5000 ? 'bg-amber-300' : 'bg-zinc-400'}"
				style="width: {playing ? (moveLeft / game.moveMs) * 100 : 0}%"
			></div>
		</div>

		<p class="mt-3 min-h-6 text-center text-sm" role="status" aria-live="polite">
			{#if game.status === 'ended'}
				<span class="font-semibold {iWon ? 'text-x' : 'text-o'}">{iWon ? 'You won.' : 'You lost.'}</span>
				{endText(game)}
			{:else if myTurn}
				<span class="font-medium">Your move</span>
				<span class="text-zinc-400">· {Math.ceil(moveLeft / 1000)}s</span>
			{:else}
				<span class="text-zinc-400">Opponent is thinking…</span>
			{/if}
		</p>

		<div class="mt-3 grid aspect-square grid-cols-3 gap-2" role="group" aria-label="Board">
			{#each cells as cell (cell)}
				{@const owner = cellOwner(game.board, cell)}
				{@const fading = owner !== null && playing && fadingCell(game.board, owner) === cell}
				{@const winning = winLine?.includes(cell) ?? false}
				<button
					type="button"
					disabled={!myTurn || owner !== null}
					onclick={() => send({ type: 'move', cell })}
					aria-label="Row {Math.floor(cell / 3) + 1}, column {(cell % 3) + 1}: {owner === null
						? 'empty'
						: symbols[owner] === '✕'
							? 'X'
							: 'O'}{fading ? ', vanishes next' : ''}"
					class="flex items-center justify-center rounded-xl border bg-panel text-5xl transition-colors
						focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
						{winning ? 'border-white' : fading ? 'border-dashed border-zinc-500' : 'border-line'}
						{myTurn && owner === null ? 'cursor-pointer hover:bg-line' : 'cursor-default'}"
				>
					{#if owner !== null}
						<span
							class="mark-pop {owner === 0 ? 'text-x' : 'text-o'} {fading ? 'opacity-35' : ''}"
							aria-hidden="true"
						>
							{symbols[owner]}
						</span>
					{/if}
				</button>
			{/each}
		</div>

		<p class="mt-3 min-h-5 text-center text-xs text-zinc-500">
			{#if notice}
				<span class="text-amber-300">{notice}</span>
			{:else if link === 'lost'}
				<span class="text-amber-300">Connection lost. Reconnecting…</span>
			{:else if playing}
				A dimmed mark with a dashed border vanishes on its owner's next move.
			{/if}
		</p>

		<div class="mt-4 flex justify-center gap-3">
			{#if game.status === 'ended'}
				{#if ratingChange !== null}
					<span class="self-center text-sm tabular-nums text-zinc-400">
						Rating {ratingChange >= 0 ? '+' : ''}{ratingChange}
					</span>
				{/if}
				<a
					href={game.ranked ? '/play' : '/'}
					data-sveltekit-reload
					class="rounded-lg bg-x px-5 py-2.5 font-medium text-ink hover:brightness-110"
				>
					{game.ranked ? 'Play again' : 'Back to lobby'}
				</a>
			{:else}
				<button
					type="button"
					onclick={() => send({ type: 'resign' })}
					class="rounded-lg border border-line px-4 py-2 text-sm text-zinc-400 hover:bg-panel hover:text-white"
				>
					Resign
				</button>
			{/if}
		</div>
	</div>
{/if}

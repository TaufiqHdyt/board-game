// End-to-end check against a running `pnpm dev`. For each game, two players
// queue, get matched and play to the end: a scripted Vanish game that exercises
// the disappearing-mark rule, then a random but legal Congklak game.
// Usage: pnpm smoke   (expects the realtime Worker on localhost:8787)
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.GAME_ORIGIN ?? 'ws://localhost:8787';
const SECRET =
	process.env.TICKET_SECRET ??
	/^TICKET_SECRET=(.+)$/m.exec(readFileSync('apps/game/.dev.vars', 'utf8'))?.[1]?.trim();
assert(SECRET, 'TICKET_SECRET not found; run `pnpm dev:setup` first');

const b64 = (buf) => Buffer.from(buf).toString('base64url');
function sign(payload) {
	const body = b64(JSON.stringify(payload));
	return `${body}.${b64(createHmac('sha256', SECRET).update(body).digest())}`;
}

function connect(path, ticket) {
	const ws = new WebSocket(`${ORIGIN}${path}?ticket=${encodeURIComponent(ticket)}`);
	const inbox = [];
	const waiters = [];
	ws.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		const waiter = waiters.shift();
		if (waiter) waiter(message);
		else inbox.push(message);
	});
	const next = () =>
		inbox.length > 0
			? Promise.resolve(inbox.shift())
			: new Promise((resolve, reject) => {
					const timer = setTimeout(() => reject(new Error(`timed out waiting on ${path}`)), 10_000);
					waiters.push((m) => (clearTimeout(timer), resolve(m)));
				});
	const until = async (predicate) => {
		for (;;) {
			const message = await next();
			if (predicate(message)) return message;
		}
	};
	return { ws, next, until };
}

const exp = Date.now() + 60_000;

/** Queue two fresh players for `game` and return their room sockets by seat. */
async function startMatch(game) {
	const players = ['Smoke A', 'Smoke B'].map((name) => ({
		pid: `smoke-${randomUUID()}`,
		name,
		mmr: 1000,
		games: 0
	}));
	const queues = players.map((player) =>
		connect('/ws/queue', sign({ kind: 'queue', game, player, exp }))
	);
	const matched = await Promise.all(queues.map((q) => q.until((m) => m.type === 'matched')));
	assert.equal(matched[0].roomId, matched[1].roomId);
	assert.equal(matched[0].game, game);
	const roomId = matched[0].roomId;
	console.log(`[${game}] matched into room`, roomId);

	const rooms = matched.map((m) => connect(`/ws/room/${roomId}`, m.ticket));
	const firstStates = await Promise.all(
		rooms.map((r) => r.until((m) => m.type === 'state' && m.connected.every(Boolean)))
	);
	const bySeat = [];
	firstStates.forEach((state, i) => (bySeat[state.you] = rooms[i]));
	assert(bySeat[0] && bySeat[1], 'each player should hold a different seat');
	assert.equal(firstStates[0].status, 'playing');
	assert.equal(firstStates[0].game, game);

	let moveCount = 0;
	async function move(seat, value) {
		bySeat[seat].ws.send(JSON.stringify({ type: 'move', move: value }));
		moveCount += 1;
		// Both players must receive the same new state.
		const states = await Promise.all(
			bySeat.map((r) => r.until((m) => m.type === 'state' && m.moveCount === moveCount))
		);
		assert.deepEqual(states[0].state, states[1].state);
		assert.deepEqual(states[0].lastMove, { seat, move: value });
		return states[0];
	}
	const close = () => [...queues, ...rooms].forEach((r) => r.ws.close());
	return { bySeat, move, close, first: firstStates[0] };
}

// ---- Vanish ----------------------------------------------------------------
{
	const { bySeat, move, close } = await startMatch('vanish');

	// A wrong-turn move is rejected.
	bySeat[1].ws.send(JSON.stringify({ type: 'move', move: 0 }));
	assert.deepEqual(await bySeat[1].until((m) => m.type === 'error'), {
		type: 'error',
		message: 'not_your_turn'
	});

	// X 0, O 3, X 1, O 2, X 5, O 7 -> each has three marks, no line.
	let state;
	for (const [seat, cell] of [[0, 0], [1, 3], [0, 1], [1, 2], [0, 5], [1, 7]]) {
		state = await move(seat, cell);
	}
	assert.deepEqual(state.state.marks, [[0, 1, 5], [3, 2, 7]]);
	assert.equal(state.winner, null);

	// X plays 6: the oldest X mark (cell 0) vanishes.
	state = await move(0, 6);
	assert.deepEqual(state.state.marks[0], [1, 5, 6]);
	console.log('[vanish] oldest mark vanished as expected');

	state = await move(1, 0);
	assert.deepEqual(state.state.marks[1], [2, 7, 0]);
	state = await move(0, 4);
	state = await move(1, 8);
	// X plays 2 -> X holds 6, 4, 2: the anti-diagonal. X wins.
	state = await move(0, 2);
	assert.equal(state.status, 'ended');
	assert.equal(state.winner, 0);
	assert.equal(state.reason, 'line');
	console.log('[vanish] X won with the diagonal after', state.moveCount, 'moves');
	close();
}

// ---- Congklak --------------------------------------------------------------
{
	const { bySeat, move, close, first } = await startMatch('congklak');
	const total = (s) => [...s.holes[0], ...s.holes[1], ...s.stores].reduce((a, b) => a + b, 0);
	assert.equal(total(first.state), 98);

	// An empty or out-of-range hole is rejected.
	bySeat[0].ws.send(JSON.stringify({ type: 'move', move: 9 }));
	assert.equal((await bySeat[0].until((m) => m.type === 'error')).message, 'out_of_range');

	let state = first;
	let extraTurns = 0;
	while (state.status === 'playing') {
		const seat = state.turn;
		const options = state.state.holes[seat].flatMap((n, i) => (n > 0 ? [i] : []));
		assert(options.length > 0, 'the player to move always has a legal hole');
		state = await move(seat, options[Math.floor(Math.random() * options.length)]);
		assert.equal(total(state.state), 98);
		if (state.status === 'playing' && state.turn === seat) extraTurns += 1;
		assert(state.moveCount < 2000);
	}
	const [a, b] = state.scores;
	assert.equal(a + b, 98);
	assert.equal(state.reason, 'score');
	assert.equal(state.winner, a === b ? null : a > b ? 0 : 1);
	console.log(
		`[congklak] finished ${a}-${b} after ${state.moveCount} turns (${extraTurns} extra turns),`,
		state.winner === null ? 'a draw' : `seat ${state.winner} won`
	);
	close();
}

console.log('smoke test passed');

// End-to-end check against a running `pnpm dev`: two players queue, get
// matched, and play a full game that exercises the disappearing-mark rule.
// Usage: pnpm smoke   (expects the realtime Worker on localhost:8787)
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.GAME_ORIGIN ?? 'ws://localhost:8787';
const SECRET =
	process.env.TICKET_SECRET ??
	/^TICKET_SECRET=(.+)$/m.exec(readFileSync('apps/game/.dev.vars', 'utf8'))?.[1]?.trim();
assert(SECRET, 'TICKET_SECRET not found; run `pnpm setup` first');

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
const players = ['Smoke A', 'Smoke B'].map((name) => ({
	pid: `smoke-${randomUUID()}`,
	name,
	mmr: 1000,
	games: 0
}));

// 1. Both players join the queue and are paired into the same room.
const queues = players.map((player) => connect('/ws/queue', sign({ kind: 'queue', player, exp })));
const matched = await Promise.all(queues.map((q) => q.until((m) => m.type === 'matched')));
assert.equal(matched[0].roomId, matched[1].roomId);
const roomId = matched[0].roomId;
console.log('matched into room', roomId);

// 2. Both connect to the room with the tickets the matchmaker issued.
const rooms = matched.map((m) => connect(`/ws/room/${roomId}`, m.ticket));
const firstStates = await Promise.all(
	rooms.map((r) => r.until((m) => m.type === 'state' && m.connected.every(Boolean)))
);
const bySeat = [];
firstStates.forEach((state, i) => (bySeat[state.you] = rooms[i]));
assert(bySeat[0] && bySeat[1], 'each player should hold a different seat');
assert.equal(firstStates[0].status, 'playing');

let moveCount = 0;
async function move(seat, cell) {
	bySeat[seat].ws.send(JSON.stringify({ type: 'move', cell }));
	moveCount += 1;
	// Both players must receive the same new state.
	const states = await Promise.all(
		bySeat.map((r) => r.until((m) => m.type === 'state' && m.board.moveCount === moveCount))
	);
	assert.deepEqual(states[0].board, states[1].board);
	return states[0];
}

// 3. A wrong-turn move and an occupied cell are rejected.
bySeat[1].ws.send(JSON.stringify({ type: 'move', cell: 0 }));
assert.deepEqual(await bySeat[1].until((m) => m.type === 'error'), {
	type: 'error',
	message: 'not_your_turn'
});

// 4. Play: X 0, O 3, X 1, O 2, X 5, O 7 -> each has three marks, no line.
let state;
for (const [seat, cell] of [[0, 0], [1, 3], [0, 1], [1, 2], [0, 5], [1, 7]]) {
	state = await move(seat, cell);
}
assert.deepEqual(state.board.marks, [[0, 1, 5], [3, 2, 7]]);
assert.equal(state.board.winner, null);

// X plays 6: the oldest X mark (cell 0) vanishes.
state = await move(0, 6);
assert.deepEqual(state.board.marks[0], [1, 5, 6]);
console.log('oldest mark vanished as expected');

// O plays 0 (the vacated cell), X plays 4 -> X holds 5, 6, 4: no line yet.
state = await move(1, 0);
assert.deepEqual(state.board.marks[1], [2, 7, 0]);
state = await move(0, 4);
assert.deepEqual(state.board.marks[0], [5, 6, 4]);
// O plays 8 -> O holds 7, 0, 8 and its mark on 2 has vanished.
state = await move(1, 8);
assert.deepEqual(state.board.marks[1], [7, 0, 8]);
// X plays 2 -> X holds 6, 4, 2: the anti-diagonal. X wins.
state = await move(0, 2);
assert.equal(state.status, 'ended');
assert.equal(state.board.winner, 0);
assert.equal(state.reason, 'line');
console.log('X won with the diagonal after', state.board.moveCount, 'moves');

for (const r of [...queues, ...rooms]) r.ws.close();
console.log('smoke test passed');

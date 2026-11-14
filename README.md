# Vanish

Online multiplayer tic-tac-toe that cannot end in a draw. Each player may have
at most three marks on the board; placing a fourth removes their oldest, so the
board never fills. Runs entirely on Cloudflare.

## Rules

- X moves first. Seats are assigned at random.
- Order of a move: validate, place, remove the mover's oldest mark if they now
  have four, then check for a line. You cannot play into the square your own
  oldest mark is about to leave, and a vanishing mark never counts toward a line.
- 15 seconds per move and a 2 minute total bank per player. Running out of
  either loses the match, so every match ends.

## Layout

```
apps/web        SvelteKit 3 (Svelte 5, Vite 8) on Workers: pages, guest sessions, tickets
apps/game       Realtime Worker: GameRoom + Matchmaker Durable Objects, results queue consumer
packages/game   Pure rules and Elo, shared by client and server (unit tested)
packages/proto  Zod message schemas and signed-token helpers
packages/db     Drizzle schema and D1 migrations
scripts         setup and an end-to-end smoke test
```

How a ranked match flows:

1. The browser asks `apps/web` for a short-lived signed ticket (`POST /api/ticket`).
2. It opens a websocket to `apps/game` at `/ws/queue`. The `Matchmaker` object
   pairs players by rating (±50 at first, widening 25 per second waited),
   creates a `GameRoom`, and tells both players the room id.
3. Both connect to `/ws/room/:id`. The room validates every move, runs the
   clocks with an alarm, and broadcasts state. Sockets hibernate between moves.
4. When the match ends the room sends one message to a Queue. The consumer
   writes the match and both rating changes to D1 in one transaction, keyed on
   the match id so redelivery is harmless.
5. The leaderboard page reads a KV snapshot that is rebuilt from D1 at most
   once a minute.

"Play a friend" creates an unranked room at an unguessable URL; the second
person to open the link becomes the opponent.

## Run locally

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm setup               # creates apps/*/.dev.vars from the examples
pnpm db:migrate:local    # creates the local D1 database
pnpm dev                 # web on http://localhost:5173, sockets on ws://localhost:8787
```

To reach it from other devices on your network (a phone, a second laptop), run
`pnpm dev:host` instead and open the Network URL that Vite prints. Both servers
then listen on all interfaces.

To play against yourself, open the site in two different browsers (or one
normal and one private window). Two tabs in the same browser share one guest
identity and count as the same player.

## Checks

```sh
pnpm test     # rules, Elo and token unit tests
pnpm check    # type-check every package and app
pnpm smoke    # with `pnpm dev` running: queue two players and play a full match
```

## Deploy

One-time setup (`pnpm dlx wrangler login` first):

```sh
cd apps/game
pnpm wrangler d1 create board-game             # copy the id into BOTH wrangler.jsonc files
pnpm wrangler queues create board-game-results
pnpm wrangler secret put TICKET_SECRET          # e.g. the output of: openssl rand -base64 32

cd ../web
pnpm wrangler kv namespace create CACHE         # copy the id into apps/web/wrangler.jsonc
pnpm wrangler secret put TICKET_SECRET          # the SAME value as above
```

Then:

```sh
pnpm db:migrate:remote
pnpm --filter @bg/realtime run deploy           # note the workers.dev URL it prints
```

Set `GAME_ORIGIN` in `apps/web/wrangler.jsonc` to that URL with the `wss://`
scheme (for example `wss://board-game-realtime.<subdomain>.workers.dev`), then:

```sh
pnpm --filter @bg/web run deploy
```

With a custom domain you can instead route the realtime Worker at
`yourdomain.com/ws/*` (see the comment in `apps/game/wrangler.jsonc`) and leave
`GAME_ORIGIN` empty.

## Not built yet

- Turnstile and rate limiting on guest sign-up and queue joins
- Sign-in with an external account (identity is a guest cookie per browser)
- Bot opponent when the queue is empty
- Seasons, match replay viewer, metrics
- Sharding the matchmaker (one global instance today)

# Board Game

Classic two-player board games online, on Cloudflare. One site, one guest
account, and a separate rating, leaderboard and history filter per game.

## Games

### Vanish

Tic-tac-toe that cannot end in a draw.

- Each player may have at most three marks. Placing a fourth removes your
  oldest, so the board never fills.
- Order of a move: validate, place, remove the mover's oldest mark if they now
  have four, then check for a line. You cannot play into the square your own
  oldest mark is about to leave, and a vanishing mark never counts toward a line.
- X moves first; seats are assigned at random.
- 15 seconds per move and a 2 minute bank per player.

### Congklak (dhakon)

The Indonesian sowing game. Rules vary by region; this is the version built.

- Seven holes and one store per player, seven seeds per hole (98 seeds).
- On your turn, take all the seeds from one of your holes and sow them one by
  one, clockwise, into every hole and your own store. The opponent's store is
  skipped. Your store is on your left.
- Where the last seed lands decides what happens next:
  - your store: you move again;
  - a hole that already held seeds, on either side: pick them all up and keep
    sowing;
  - an empty hole on your side: capture that seed and the seeds in the facing
    hole (if it has any) into your store, and your turn ends;
  - an empty hole on the opponent's side: your turn ends.
- The game ends when the player to move has no seeds in their holes. Seeds left
  on the board go to the store of the side they are on.
- More seeds wins. 49 each is a draw, and a draw is rated as half a win.
- One round per match, with a random first player.
- 20 seconds per move and a 5 minute bank per player. A long sowing turn is
  replayed seed by seed on screen, and the next player's clock only starts once
  that replay has had time to finish.

In every game, running out of time on a move or on your bank loses the match.

## Layout

```
apps/web        SvelteKit 3 (Svelte 5, Vite 8) on Workers: pages, guest sessions, tickets
apps/game       Realtime Worker: GameRoom + Matchmaker Durable Objects, results queue consumer
packages/game   Pure rules for each game, the game catalogue, and Elo (unit tested)
packages/proto  Zod message schemas and signed-token helpers
packages/db     Drizzle schema and D1 migrations
scripts         setup and an end-to-end smoke test
```

How a ranked match flows:

1. The browser asks `apps/web` for a short-lived signed ticket (`POST /api/ticket`)
   naming the game.
2. It opens a websocket to `apps/game` at `/ws/queue`. There is one `Matchmaker`
   object per game. It pairs players by their rating in that game (±50 at
   first, widening 25 per second waited), creates a `GameRoom`, and tells both
   players the room id.
3. Both connect to `/ws/room/:id`. The room validates every move with that
   game's rules, runs the clocks with an alarm, and broadcasts state. Sockets
   hibernate between moves.
4. When the match ends the room sends one message to a Queue. The consumer
   writes the match and both rating changes to D1 in one transaction, keyed on
   the match id so redelivery is harmless.
5. The leaderboard page reads a per-game KV snapshot that is rebuilt from D1 at
   most once a minute.

"Play a friend" creates an unranked room at an unguessable URL; the second
person to open the link becomes the opponent.

### Adding a game

1. Write its rules in `packages/game/src` and register a `GameDef` in
   `games.ts` (moves are small integers; `outcome` may return a draw).
2. Add the id to `GameIdSchema` in `packages/proto/src/messages.ts`.
3. Add a board component in `apps/web/src/lib` and render it in `Game.svelte`.

The room, matchmaker, results recorder, leaderboard and history need no changes.

## Run locally

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev:setup           # creates apps/*/.dev.vars from the examples
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
pnpm test     # rules, Elo, tokens, and result recording against a local D1
pnpm check    # type-check every package and app
pnpm smoke    # with `pnpm dev` running: queue two players and play a full match of each game
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
- Sharding the matchmaker (one instance per game today)

# Chess Games Dashboard — CLAUDE.md

## Project Overview
A dashboard over your own chess games. The user signs in with Google, links their chess.com and
lichess usernames, syncs recent games into Firestore, saves named opening lines, and reads
win/draw/loss splits for all games or for the games that followed one of those lines.

## Core User Flow
1. Sign in with Google (`/`)
2. `/profile` — save chess.com / lichess usernames, then sync the last N games in the selected time
   formats
3. `/patterns` — paste an opening line, name it, optionally tie it to a colour; a line that
   continues an existing one nests under it as a sub-variation. Saved lines can be edited.
4. `/dashboard` — the Opening dropdown picks "All games", any saved line, or "Not in a saved
   opening" as the last entry; narrow further by site, colour, time format, date window and your
   own rating band — the Control chips list the clocks you have actually played. Read overall / as White / as Black stats, the clock KPI, and the game phase
   analysis, plus a table breaking the slice down by sub-variation. The "Ended in" dropdown scopes
   to games that finished in one phase (`?phase=11-15`); clicking a phase's *ended* count sets the
   same filter, the way clicking a variation row sets the opening.
5. `/games/{id}` — one game: a board you can step through, the engine's marks on the move list,
   and your own root-cause analysis of the one to three moves that decided it. Reached from any
   row in the dashboard's game list, which carries the filters along so Back returns to the same
   slice and Next walks it. The Mistake database panel on the dashboard adds up the tags those
   reviews carry; clicking a tag filters the games down to it.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 (dark zinc palette)
- **Auth + storage**: Firebase Auth (Google) + Firestore, client SDK only
- **Chess logic**: chess.js (PGN parsing, move replay, FEN)
- **Package manager**: yarn

## Project Structure
```
src/
├── app/
│   ├── layout.tsx              # Root layout, wraps AuthProvider
│   ├── page.tsx                # Sign-in + nav
│   ├── profile/page.tsx        # Linked accounts + sync
│   ├── patterns/page.tsx       # Saved opening lines
│   ├── dashboard/page.tsx      # Stats + pattern filter + game list
│   ├── games/[id]/page.tsx     # One game: board, moves, your own review
│   └── api/
│       ├── chesscom/games/route.ts
│       ├── lichess/games/route.ts
│       └── export/route.ts     # read-only JSON export, API-key gated
├── components/                 # PageShell, SyncPanel, PatternForm, StatBlockCard,
│                               # VariationTable, GameRow, Chip, Board, PieceSprites,
│                               # MoveList, ReviewEditor, ReviewPanel
├── context/AuthContext.tsx     # onAuthStateChanged provider + useAuth()
├── lib/
│   ├── firebase.ts             # app/auth/db singletons
│   ├── firebase-admin.ts       # service-account Firestore, export route only
│   ├── export.ts               # builds the /api/export payload
│   ├── dashboard-filters.ts    # dashboard filters <-> query string
│   ├── game-filters.ts         # date / rating / format scope rule, shared with the export
│   ├── scope.ts                # criteria + opening together, shared with the game view
│   ├── review.ts               # review vocabulary, tag counts, review queue
│   ├── board.ts                # replay, board squares, SAN parsing for the game view
│   ├── ratings.ts              # reconstructs pre-game ratings, Elo expectation
│   ├── clocks.ts               # per-move time, timeout KPI, phases, mistakes by phase
│   ├── engine.ts               # Stockfish 18 lite in a worker, queued, FEN-cached
│   ├── analysis.ts             # move classification and the annotated PGN
│   ├── termination.ts          # one ending vocabulary across the two providers
│   ├── auth.ts                 # signInWithGoogle / signOut
│   ├── firestore.ts            # profile, games, patterns CRUD
│   ├── sync.ts                 # client calls to the provider routes
│   ├── pattern.ts              # position keys, pattern parsing, matching
│   ├── stats.ts                # StatBlock / computeSplit
│   └── providers/              # chesscom.ts, lichess.ts, shared.ts
└── types/chess.ts              # shared types
```

## Key Decisions
- **Provider fetching happens in route handlers**, not the browser: chess.com needs a real
  `User-Agent`, and it keeps both providers behind one normalized `SyncedGame` shape.
- **Deterministic game ids** (`chesscom_{uuid}`, `lichess_{id}`), and `saveGames` upserts with
  `merge`. Rewriting games already stored is what lets a re-sync backfill fields added later —
  clock readings were added this way.
- **Phase entry clock is normalized to the control's base time**, not absolute seconds, so 3+2 and
  15+10 can be compared in one column. It can read above 100% when the increment has outpaced the
  time spent.
- **Game phases are the user's own named segments**, in their own move numbers, set in `PHASES` in
  `lib/clocks.ts`: opening setup (1-4), variation development (5-10), structure definition (11-15),
  tactical / strategic duel (16-30), pre-endgame (31+). They are contiguous with no overlap — the
  original sketch had 16-30 and 30+ both containing move 30.
- **Move classification follows the chess-courses standard**, which is context-sensitive on
  purpose. With `cpLoss = cpBefore - cpAfter` from your own perspective:
  `??` when the loss clears the blunder threshold *and* `cpAfter < 200` *and* `cpBefore > -200`;
  `?` likewise at the mistake threshold; a big loss failing either guard is only `?!`. So a slip
  while already lost is not a blunder — there was nothing left to lose — and one while still
  clearly winning is only careless. Going from winning back to level *does* get the full mark,
  because `cpAfter` has fallen inside the decided band. Defaults are 300 / 100 centipawns.
  **`?!` is recorded but never shown.** It is by definition the mark for a costly move the
  context excused — +12.4 to +9.8 earns one — so putting it on screen or offering it up for
  review would argue against the rule that produced it. `FAULT_TAGS` in `lib/review.ts` is the
  one list of marks that reach a screen or a PGN: `??` and `?`.
- **The engine runs in the browser**, Stockfish 18 lite single-threaded in a worker, copied to
  `/public` on postinstall and gitignored. Single-threaded is deliberate: the multi-threaded build
  needs cross-origin isolation headers. Requests are queued rather than rejected when busy, and
  cached by FEN — games in one opening share most of their early positions.
- **Analysis is written per game as it finishes**, both as a `StoredAnalysis` for filtering and as
  an `annotatedPgn` carrying the symbols on your own moves. Stopping a run therefore loses at most
  one game. Only your moves are annotated, and only the two marks `isFault` allows, so the PGN
  you copy out carries exactly what the app shows.
- **The providers do not share a termination vocabulary.** chess.com says `timeout` for running
  out of clock; lichess says `outoftime` and reuses `timeout` for a player who walked away.
  Matching the raw string silently undercounted the flag KPI. `normalizeEnding` in
  `lib/termination.ts` maps both onto one `Ending` union, derived at read time so no re-sync is
  needed, and everything counting endings goes through `isFlagged` / `endingOf`.
- **Clock readings arrive differently per provider.** chess.com puts `{[%clk h:mm:ss]}` on every
  move in the PGN; lichess returns a `clocks` array that is one entry longer than the move list
  because it prepends the starting clock. `alignClocks` trims from the front, since the last
  reading always belongs to the last ply. `timeSpentPerPly` then diffs each ply against two plies
  back and adds the increment, because a reading already includes it.
- **Engine games are excluded unconditionally**, in `matchesCriteria`, since they say nothing
  about play against people. Lichess marks them with `aiLevel`, which is what `opponentIsBot`
  reads; chess.com's public archive carries no bot marker and its bots are ordinary accounts, so
  they are indistinguishable there. Matching on the opponent's *name* would be wrong — a real
  chess.com human in this data is called `anonymous1177`. Bot games are still stored and flagged
  rather than skipped at sync, so a re-sync backfills the flag on games saved before it existed.
- **The board uses the Cburnett piece set** (via lichess-org/lila, CC BY-SA 3.0), vendored in
  `components/PieceSprites.tsx` as twelve SVG symbols that each square references with `<use>`.
  Unicode glyphs were tried first and are not good enough: the hollow white pieces render
  differently per font and vanish on a light square. The sprite sheet is a raw string rather than
  JSX, since hand-converting every `fill-rule` to `fillRule` would only invite transcription
  slips. Board colours are deliberately off the zinc palette — a board has to read as a board.
- **Every square is pinned to a grid fraction and the pieces are absolutely placed**, because a
  board that resizes as you step through it is unusable. Both failure modes were real: rows that
  sized to their contents grew around a tall piece, and a board column sized with
  `minmax(0,28rem)` took its width from the readout *under* the board, so the board shrank on
  moves with no clock reading to show. The track is a fixed `28rem` for the same reason.
- **A review is three questions about at most three moves.** The method is borrowed from
  incident root-cause analysis: name what failed, why it failed, and what would have caught it.
  `MAX_REVIEW_MISTAKES` is 3 on purpose — a post-mortem that blames every move explains nothing,
  so the cap forces a choice. Each entry asks why the move is a mistake, what was visible in the
  position that should have redirected you, and what you would play instead; proposed moves are
  validated against the position with chess.js and only the legal ones are stored, since the
  point is a move you could actually have played.
- **"Beyond what I could be expected to find" is the escape hatch, and it is not a shrug.** The
  engine's objection stands, but no pattern is trainable from it, so the entry is stored and then
  left out of everything that counts: `trainableMistakes` drops it, so it reaches neither the tag
  table nor the tag filter. Those two using the same rule is what makes a row in the table and
  the games behind it the same set. A move marked this way needs no answers; everything else
  needs a cause and at least one tag, or it adds a row that says nothing.
- **Tags are a fixed vocabulary you can extend.** `TAG_GROUPS` in `lib/review.ts` groups them by
  what actually broke — tactics, calculation, strategy, endgame, opening, mindset — because a
  count is only comparable across months if the words stay the same. Free tags are still allowed
  and are offered back as suggestions (`knownTags`), landing in a "Your own" group.
- **Reviews live on the game document**, like the analysis, not in a subcollection. The dashboard
  already holds every game, so filtering by review state, counting tags and finding the next game
  to review cost no extra reads. `saveGames` merges, so a re-sync never clears a review.
- **The review path runs at `REVIEW_DEPTH` (16), the batch at 12 by default.** A batch pays its
  depth once per game across a whole branch and only needs to find the blunders; analysing the
  single game in front of you, or asking what the engine wanted on one move, is about to become
  something you write down, so it rests on the better evaluation.
- **The engine says where to look; the review says why.** `reviewQueue` is analysed games with a
  blunder or mistake and no review yet, blunders first, which is what the "Review next game"
  button follows. The engine's own best move is available per entry but only on demand — after
  you have committed to your own answer, which is the point of writing it down first.
- **`lib/scope.ts` joins the criteria to the opening filter**, so the dashboard's list and the
  game view's Newer / Older / Next unreviewed walk exactly the same slice in the same order. The
  game view takes the filters from the query string it was linked with.
- **`matchesCriteria` in `lib/game-filters.ts` is the single scope rule** — site, colour, time
  control, date window, rating band, the phase a game ended in, whether you have reviewed it and
  which tag that review carries.
- **Analysis filters by time control, not time class.** 10+0 and 15+10 are both "rapid" and behave
  nothing alike on the clock, so `timeControls` holds canonical ids (`180+2`) and `timeControlKey`
  reconciles chess.com's `600` with lichess's `600+0`. The dashboard offers only the controls
  present in the stored games, via `timeControlsIn`. The *sync* path still speaks time classes,
  because that is what both provider APIs filter on. The dashboard and `/api/export` both run it, so a slice you read on screen and a slice I pull over HTTP can never
  drift apart. A game with no recorded rating survives a rating filter rather than vanishing.
- **Reads are cache-first, because Firestore bills per document.** The dashboard needs the whole
  games collection, so a server read per page view burns the free daily quota in a few dozen
  visits — it was actually exhausted once during development. `db` is built with
  `persistentLocalCache`, and `readDocs` in `lib/firestore.ts` tries `getDocsFromCache` before the
  server. Note that `persistentLocalCache` alone changes nothing: `getDocs` still queries the
  server and bills for every document, so the explicit cache read is the part that saves quota.
  Syncs write through the cache, so it is only stale if another device synced; the dashboard's
  Refresh button and the `fresh` option force a server read.
- **Stats are never stored.** `computeSplit` runs over the loaded games on every render.
- **Pattern matching is position-based**: `positionKey` is FEN fields 1–3 (placement, side to move,
  castling) after the pattern's last move, and a game matches if it ever reaches that key within
  `MAX_PATTERN_PLY` (60) half-moves. That makes transpositions count.
- **The variation tree is derived, never stored.** `buildPatternTree` nests a saved line under the
  deepest other saved line that is a move-prefix of it, so 1.e4 c6 2.d4 d5 3.e5 files itself under
  1.e4 c6. Editing or deleting a line re-parents everything automatically.
- **Colour is part of a repertoire's identity.** The same opening saved once as White and once as
  Black is two separate trees, and `canNest` keeps a line out of a parent saved for the other
  colour — the Panov Attack saved as White will not land under a Caro-Kann saved as Black. A
  colour-agnostic parent adopts either side; a colour-specific parent never adopts an agnostic
  child, which would widen it. `patternLabel` appends "(as White)" / "(as Black)" so the two are
  distinguishable in the dropdown, breadcrumb and tables.
- **`next.config.ts` pins `@opentelemetry/api` to its CommonJS build.** firebase-admin pulls it in
  transitively and its ESM entry has extensionless relative imports the bundler cannot resolve;
  Next's own tracer imports it, so `serverExternalPackages` alone does not help. Removing the
  `turbopack.resolveAlias` floods the dev console with module-not-found errors.
- **The admin credential is format-agnostic.** `FIREBASE_ADMIN_CREDENTIALS` holds either a service
  account key or the `authorized_user` JSON from `gcloud auth application-default login`;
  `readCredential` picks `cert()` or `refreshToken()` off the `type` field. The second form exists
  because org policy can forbid service account keys outright.
- **Stored ratings are POST-game, on both providers.** `userRating` / `opponentRating` already
  include the result of that very game, so bucketing by rating difference sorts wins into
  "weaker opponent" and losses into "stronger opponent" by construction — it produced a completely
  inverted result before this was caught. `withRatingsBefore` in `lib/ratings.ts` rebuilds the
  pre-game numbers: yours is the previous game's post rating in the same pool, the opponent's is
  theirs with this game's move undone by the pool's median step. Pools are keyed by
  `source + timeClass`, since a site keeps one rating per class, not per clock. It is derived at
  read time rather than stored, because syncs arrive newest-first and a game's predecessor often
  lands in a later sync.
- **The export endpoint fails closed.** `/api/export` returns 503 unless `EXPORT_API_KEY` and
  an admin credential are configured, and 401 on a key mismatch (constant-time compare, header only — never a
  query param). It needs the Admin SDK because it runs with no signed-in user and Firestore rules
  scope every document to its owner.
- **Dashboard filters live in the query string** (`readFilters` / `writeFilters`), seeded from
  `useSearchParams` and mirrored with `history.replaceState` so chip clicks stay instant and the
  back button is not flooded.
- **A variation's games include its sub-variations** (`gameMatchesNode` unions the subtree), so a
  parent's totals always cover its children even when a game transposed straight into a child.

## Conventions
- **Imports**: `@/*` alias for `src/*`
- **Components**: PascalCase exports, one per file
- **Styling**: Tailwind utilities, `bg-zinc-950` page / `bg-zinc-900` cards / `border-zinc-800`
- **Auth guard**: wrap page bodies in `PageShell`, which handles loading and signed-out states
- **State**: page-level `useState`, derived values in `useMemo`; no global store

## Common Commands
```bash
yarn dev
yarn build
yarn lint
```

## Removed on purpose
- Per-game "ignore". Date and rating filters cover the same need without a stored flag, so the
  `ignored` field is no longer read or written. Old documents may still carry it; it is inert.

## Known limitations
- `Failed to obtain primary lease for action 'Collect garbage'` in the console is expected, not a
  fault. With `persistentMultipleTabManager` exactly one tab holds the primary lease and runs the
  cache's housekeeping; a second tab that tries logs this and stands down. The SDK logs it through
  `logError` and handles it on its own retry queue, which is why it looks alarming and changes
  nothing — reads and writes keep working in every tab. Opening a game view beside the dashboard
  is enough to produce it.
- Lichess arena *berserk* games halve the starting clock while still reporting the full
  `clock.initial`, so the first move's time is overstated for them. Nothing else is affected.
- `clocks` is null on games synced before clock capture existed; a re-sync backfills them.

## Not built yet
- Transpositions *between* named openings (a line only nests by literal move prefix)
- Background or scheduled syncing
- Any training drill built from the tag counts — the database is read by eye for now

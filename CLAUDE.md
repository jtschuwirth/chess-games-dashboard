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
│   └── api/
│       ├── chesscom/games/route.ts
│       ├── lichess/games/route.ts
│       └── export/route.ts     # read-only JSON export, API-key gated
├── components/                 # PageShell, SyncPanel, PatternForm, StatBlockCard,
│                               # VariationTable, GameRow, Chip
├── context/AuthContext.tsx     # onAuthStateChanged provider + useAuth()
├── lib/
│   ├── firebase.ts             # app/auth/db singletons
│   ├── firebase-admin.ts       # service-account Firestore, export route only
│   ├── export.ts               # builds the /api/export payload
│   ├── dashboard-filters.ts    # dashboard filters <-> query string
│   ├── game-filters.ts         # date / rating / format scope rule, shared with the export
│   ├── ratings.ts              # reconstructs pre-game ratings, Elo expectation
│   ├── clocks.ts               # per-move time, timeout KPI, thinking by phase
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
- **`matchesCriteria` in `lib/game-filters.ts` is the single scope rule** — site, colour, time
  control, date window, rating band and the phase a game ended in.
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
- Lichess arena *berserk* games halve the starting clock while still reporting the full
  `clock.initial`, so the first move's time is overstated for them. Nothing else is affected.
- `clocks` is null on games synced before clock capture existed; a re-sync backfills them.

## Not built yet
- Transpositions *between* named openings (a line only nests by literal move prefix)
- Engine / accuracy analysis
- Background or scheduled syncing

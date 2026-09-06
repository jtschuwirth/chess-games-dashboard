# Chess Games Dashboard — CLAUDE.md

## Project Overview
A dashboard over your own chess games. The user signs in with Google, links their chess.com and
lichess usernames, syncs recent games into Firestore, saves named opening lines, and reads
win/draw/loss splits for all games or for the games that followed one of those lines.

## Core User Flow
1. Sign in with Google (`/`)
2. `/profile` — save chess.com / lichess usernames, then sync the last N games in the selected time
   formats
3. `/patterns` — paste an opening line, name it, optionally tie it to a colour
4. `/dashboard` — pick "All games" or a saved opening; read overall / as White / as Black stats;
   ignore individual games to drop them from the data set

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
│       └── lichess/games/route.ts
├── components/                 # PageShell, SyncPanel, PatternForm, StatBlockCard, GameRow, Chip
├── context/AuthContext.tsx     # onAuthStateChanged provider + useAuth()
├── lib/
│   ├── firebase.ts             # app/auth/db singletons
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
- **Deterministic game ids** (`chesscom_{uuid}`, `lichess_{id}`). A sync writes only ids that don't
  exist yet, which is what makes `ignored` survive re-syncs.
- **Stats are never stored.** `computeSplit` runs over the loaded games on every render.
- **Pattern matching is position-based**: `positionKey` is FEN fields 1–3 (placement, side to move,
  castling) after the pattern's last move, and a game matches if it ever reaches that key within
  `MAX_PATTERN_PLY` (60) half-moves. That makes transpositions count.

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

## Not built yet
- Stacking several lines under one named repertoire
- Engine / accuracy analysis
- Background or scheduled syncing

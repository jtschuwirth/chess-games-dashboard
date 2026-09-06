# Chess Games Dashboard

Link your chess.com and lichess accounts, sync your recent games into Firebase, save the opening
lines you play, and see how each one actually scores.

## What it does

- **Google sign-in** (Firebase Auth).
- **Link accounts** — public chess.com and lichess usernames; no OAuth on either site.
- **Sync games** — pick the time formats (one or more) and how many recent games to pull per
  account. Games already stored are never rewritten, so anything you ignored stays ignored.
- **Save openings** — paste a line such as
  `1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Nxf6+ exf6 6. Bd3` and name it
  "Caro-Kann Tartakower, with Bd3". A game follows the line whenever it *reaches the position* at
  the end of it, so transpositions count.
- **Dashboard** — wins / draws / losses with percentages, always split three ways (overall, as
  White, as Black), for all games or for one saved opening. Any game can be ignored so it drops out
  of the numbers without a later sync bringing it back.

## Setup

1. `yarn install`
2. Copy `.env.local.example` to `.env.local` and fill in the Firebase web config.
3. `yarn dev` → http://localhost:3000

### Firebase console (one-time)

1. Create a project, then add a **Web app** and copy the config into `.env.local`.
2. **Authentication → Sign-in method →** enable **Google**.
3. **Authentication → Settings → Authorized domains →** add `localhost` and any deploy domain.
4. **Firestore Database →** create a database.
5. Deploy the rules in `firestore.rules` (paste them into **Firestore → Rules**, or
   `firebase deploy --only firestore:rules`).

## Data model

```
users/{uid}                     chesscomUsername, lichessUsername, lastSyncAt
users/{uid}/games/{id}          id = `chesscom_{uuid}` | `lichess_{id}`
                                source, url, playedAt, timeClass, timeControl, color, result,
                                termination, opponent, ratings, eco, openingName,
                                moves: string[] (SAN), ignored: boolean
users/{uid}/patterns/{id}       name, pgn, moves: string[], positionKey, ply, color
```

Nothing aggregated is ever stored: every number on the dashboard is derived from the games list at
read time, so ignoring a game or syncing more games immediately changes the stats.

## Commands

```bash
yarn dev         # dev server on http://localhost:3000
yarn build       # production build
yarn start       # serve the production build
yarn lint        # eslint
```

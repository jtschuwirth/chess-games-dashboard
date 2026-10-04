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
  the end of it, so transpositions count. Lines are cumulative: save `1. e4 c6` as "Caro-Kann" and
  `1. e4 c6 2. d4 d5 3. e5` as "Advance Variation", and the second nests inside the first. Colour
  keeps repertoires apart: if you play the Caro-Kann from both sides, save it twice and each
  sub-variation joins the side it was saved for. Saved lines can be renamed and re-edited at any
  time.
- **Dashboard** — wins / draws / losses with percentages, always split three ways (overall, as
  White, as Black), for all games or for one saved opening. A clock panel tracks the share of
  losses that are timeouts, plus median time left, seconds per move and how much of the clock goes
  on the first ten moves. Below that, a table breaks the current
  slice down one level: top-level openings when nothing is selected, sub-variations once you pick
  one. Click a row to drill in. Filter by site, colour, time control, date window (1 month to
  3 years) and the rating you held at the time, so a long history can be narrowed to a comparable stretch.

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

## JSON export (`GET /api/export`)

A read-only endpoint that returns everything the dashboard derives, so the data can be analysed
outside the app. **It is off until you configure it**, and it serves nothing without the key.

Add to `.env.local`:

```
EXPORT_API_KEY=<a long random string>
FIREBASE_ADMIN_CREDENTIALS=<admin credential JSON on one line>
# EXPORT_UID=<only needed once a second account has signed in>
```

Firestore rules scope every document to its owner, so the endpoint needs an admin credential to
read your data with no signed-in user. `FIREBASE_ADMIN_CREDENTIALS` takes either:

- **A service account key** — Project settings → Service accounts → Generate new private key.
- **Your own user credentials** — run `gcloud auth application-default login` and use the JSON it
  writes to `%APPDATA%/gcloud/application_default_credentials.json` (Windows) or
  `~/.config/gcloud/application_default_credentials.json` (macOS, Linux). Use this when the
  project sits under an organization that blocks service account key creation, which is a
  common policy.

Either file can be flattened onto one line with this script (the private key is full of newline
escapes, so pasting it by hand tends to break it):

```bash
node scripts/set-admin-credentials.mjs /path/to/credentials.json
```

`GOOGLE_APPLICATION_CREDENTIALS` pointing at either file works too. With one account stored the
export finds your uid on its own. `.env.local` is gitignored — treat `EXPORT_API_KEY` as a
password: anyone holding it can read every game and line you have stored.

```bash
curl -H "x-api-key: $EXPORT_API_KEY" http://localhost:3000/api/export
```

| Query | Default | Meaning |
|-------|---------|---------|
| `games=0` | games included | Drop the per-game list, keep the summaries |
| `moves=1` | off | Include full SAN move lists (much larger) |
| `limit=N` | 200 | Cap the per-game list (max 2000) |
| `tc=180%2B2,900%2B10` | all | Restrict to time controls (canonical ids) |
| `source=chesscom` | both | Restrict to one site |
| `phase=11-15` | any | Only games that ended in that phase |
| `mistakes=blunder` | any | `blunder`, `mistake`, `clean` or `analysed` |
| `color=white` | both | Restrict to one side |
| `since=3m` | all time | Window: `1m`, `3m`, `6m`, `12m`, `24m`, `36m` |
| `minElo=1050&maxElo=1300` | none | Your own rating at the time of the game |

Both providers report the rating *after* each game, so the payload also carries reconstructed
pre-game numbers on every game (`ratingBefore`, `opponentRatingBefore`, `ratingDiff`) and a
`byOpponentStrength` block comparing your score against what those differences predicted. Using the
stored post-game ratings for that comparison produces an inverted result — see `lib/ratings.ts`.

The payload carries `totals` and `byTimeClass`, a `variations` array (every saved line with its
root-first `path` and win/draw/loss split, sub-variations included), `unclassified`, an
`unsavedOpenings` list — openings you play that no saved line covers, grouped by colour, each with a
pasteable `sampleLine` — and the games themselves, each tagged with the saved line it followed.
Ignored games are excluded from every number.

## Engine analysis

The dashboard can run Stockfish over whatever the filters currently select — every Caro-Kann, say.
It runs in a worker in your browser tab, so leave the tab open; each game is saved as it finishes,
so stopping loses at most one. Analysed games gain an `annotatedPgn` you can paste into any board,
and the annotations then drive the blunder columns and the Engine filter.

Moves are classified the way the chess-courses annotator does it, which deliberately reads the
position and not just the centipawn loss: a slip while already lost is not marked as a blunder, one
made while still clearly winning is only `?!`, and letting a winning position slip back to level
gets the full `??`.

## Deploying to Vercel

Import the repo, keep the defaults, and set the environment variables below. The build
needs none of them to succeed, so a first deploy will not fail on a missing key — it
will just show the setup notice until the Firebase ones are in.

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` (six) | signing in and reading your games; also what the engine service checks a sign-in against |
| `EXPORT_API_KEY` | only `GET /api/export`; leave it out and the endpoint stays off |
| `FIREBASE_ADMIN_CREDENTIALS` | only `GET /api/export` |

Two things to do in the Firebase console afterwards:

- **Authentication → Settings → Authorized domains**: add the `*.vercel.app` domain (and
  any custom one), or Google sign-in is refused on the deployment.
- Nothing else — Firestore rules already scope every document to its owner.

The Stockfish binaries are copied into `public/` by `postinstall`, which Vercel runs,
and are gitignored rather than committed.

## Running the engine on the server

Stockfish normally runs in your browser. On a phone that is slow, and the tab gets
suspended the moment you switch app, so each analysis surface has an **Engine runs on**
switch: *this device* or *the server*. The choice is remembered per device.

On *the server*, each position is posted to `/api/engine`, which runs the same engine
under Node and answers in about two seconds at depth 21. The endpoint requires a signed-in
Firebase ID token — it is the one route that burns real CPU on request, and an open one
is an invitation to spend the deployment's compute. It needs no extra configuration
beyond the `NEXT_PUBLIC_FIREBASE_*` variables.

Analysing one game is roughly eighty requests, which is fine on either setting. *This
device* stays the default because it costs nothing and keeps your games off the wire.

## Data model

```
users/{uid}                     chesscomUsername, lichessUsername, lastSyncAt
users/{uid}/games/{id}          id = `chesscom_{uuid}` | `lichess_{id}`
                                source, url, playedAt, timeClass, timeControl, color, result,
                                termination, opponent, ratings, eco, openingName,
                                moves: string[] (SAN), clocks: number[] (seconds left per ply)
users/{uid}/patterns/{id}       saved OPENING lines — the id predates the rename
```

Nothing aggregated is ever stored: every number on the dashboard is derived from the games list at
read time, so changing a filter or syncing more games immediately changes the stats.

Games are read from an IndexedDB cache rather than Firestore on every page view, because Firestore
bills one read per document and the dashboard needs the whole collection. Syncing writes through
the cache; the dashboard's **Refresh** re-reads from the server when another device has synced.

## Commands

```bash
yarn dev         # dev server on http://localhost:3000
yarn build       # production build
yarn start       # serve the production build
yarn lint        # eslint
```

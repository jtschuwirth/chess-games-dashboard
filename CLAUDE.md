# Chess Games Dashboard — CLAUDE.md

## Project Overview
A dashboard over your own chess games. The user signs in with Google, links their chess.com and
lichess usernames, syncs recent games into Firestore, saves named opening lines, and reads
win/draw/loss splits for all games or for the games that followed one of those lines.

## Core User Flow
1. Sign in with Google (`/`)
2. `/profile` — save chess.com / lichess usernames, and paste in a PGN to study. Syncing
   itself lives on the dashboard. The two screens that explain the analysis live here as
   well: the thresholds the move marks are a judgement about, and what a whole game's
   descriptor is read from.
3. `/openings` — paste an opening line, name it, optionally tie it to a colour; a line that
   continues an existing one nests under it as a sub-variation. Saved lines can be edited.
4. `/dashboard` — Sync games sits at the top, folded, so bringing in new games does not
   mean leaving the page. The Opening dropdown picks "All games", any saved line, or "Not in a saved
   opening" as the last entry; narrow further by site, colour, time format, date window and your
   own rating band — the Control chips list the clocks you have actually played. Read overall / as White / as Black stats, the clock KPI, and the game phase
   analysis, a table of what kind of games these were — which doubles as a filter, since
   clicking a row narrows the slice to it — plus a table breaking the slice down by
   sub-variation. The "Ended in" dropdown scopes
   to games that finished in one phase (`?phase=11-15`); clicking a phase's *ended* count sets the
   same filter, the way clicking a variation row sets the opening. A game the engine has
   never seen carries a control to analyse it right there in the list; press it on several
   and they queue up rather than fighting each other for the one engine.
5. `/games/{id}` — one game: the eval graph and what kind of game it was, folded away at the
   top; a board you can step through, the engine's marks on the move list,
   and your own root-cause analysis of the one to three moves that decided it. A second
   pass over the marked moves says what *kind* of mistake each was — a line missed, a
   won game thrown, an edge mishandled — and any reading can be thrown out. Reached from any
   row in the dashboard's game list, which carries the filters along so Back returns to the same
   slice and Next walks it. The Mistake database panel on the dashboard adds up the tags those
   reviews carry; clicking a tag filters the games down to it.
6. `/patterns` — write up the ideas themselves: a name, a kind, the conditions that
   bring it about, and the games showing it, each opened on the move where the idea
   appears. Any move of a line can carry its own comment, and they
   are listed beside the board to read or to jump to. Each pattern's name becomes a tag
   in the review form, so a mistake can point at the idea you should have played, and the
   pattern's own page lists the games where you did that.
7. `/plans` — a stretch of deliberate practice written down: a name, a start date, and weeks
   of days carrying the same tasks, editable from there. Count things off — three of five
   puzzles — write a note on the day, and see the games you played that day beside it.
   The plan says what it has been worth — your rating going in against where it stands
   now — and every week says the same over its own seven days, read from the rating
   history with nothing to press. Weeks fold, and more can be added as the plan runs on.
   Editing is local until you press Save, and what you have not saved is kept on the
   device, so closing the tab or switching app does not cost you it.
8. `/learn` — the positions from those reviews put back in front of you, one at a time, with the
   answer withheld until you have tried. Drill `from my reviews` or `from every flagged mistake`,
   under the same dashboard filters, and read what is sticking by tag.

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
│   ├── openings/page.tsx       # Saved opening lines
│   ├── dashboard/page.tsx      # Stats + opening filter + game list
│   ├── games/[id]/page.tsx     # One game: board, moves, your own review
│   ├── patterns/page.tsx       # Thematic patterns: list + create
│   ├── patterns/[id]/page.tsx  # One pattern: conditions, lines, where you wanted it
│   ├── plans/page.tsx          # Study plans: list + create
│   ├── plans/[id]/page.tsx     # One plan: weeks, days, tasks, notes, that day's games
│   ├── learn/page.tsx          # Drill over the reviewed positions
│   └── api/
│       ├── chesscom/games/route.ts
│       ├── lichess/games/route.ts
│       ├── engine/route.ts     # server-side Stockfish, Firebase token gated
│       └── export/route.ts     # read-only JSON export, API-key gated
├── components/                 # PageShell, SyncPanel, OpeningForm, StatBlockCard,
│                               # AnalyseButton,
│                               # VariationTable, GameRow, Chip, Board, PieceSprites,
│                               # MoveList, ReviewEditor, ReviewPanel, DrillCard,
│                               # EnginePanel, EngineMode, PatternForm, LineBoard,
│                               # PatternLineCard,
│                               # UploadPanel, AccuracyPanel, StatusTag, Section,
│                               # PlanDayCard, PlanWeekCard, PlanForm, PlanRatings,
│                               # AnalysisSettingsPanel, VerdictPanel, ShapePanel, EvalGraph,
│                               # GameShapePanel,
│                               # HomeNav, RatingPanel
├── context/AuthContext.tsx     # onAuthStateChanged provider + useAuth()
├── lib/
│   ├── firebase.ts             # app/auth/db singletons
│   ├── firebase-admin.ts       # service-account Firestore, export route only
│   ├── export.ts               # builds the /api/export payload
│   ├── dashboard-filters.ts    # dashboard filters <-> query string
│   ├── game-filters.ts         # date / rating / format scope rule, shared with the export
│   ├── scope.ts                # criteria + opening together, shared with the game view
│   ├── review.ts               # review vocabulary, tag counts, review queue
│   ├── drill.ts                # drill cards, the pass rule, what is sticking
│   ├── board.ts                # replay, board squares, SAN parsing for the game view
│   ├── ratings.ts              # reconstructs pre-game ratings, Elo expectation
│   ├── clocks.ts               # per-move time, timeout KPI, phases, mistakes by phase
│   ├── engine.ts               # Stockfish 19 lite in a worker, queued, FEN-cached
│   ├── engine-protocol.ts      # what an evaluation is, shared by both engines
│   ├── server-engine.ts        # the same engine under Node, behind /api/engine
│   ├── analysis.ts             # move classification and the annotated PGN
│   ├── analysis-queue.ts       # one first pass at a time, wherever it was started from
│   ├── bands.ts                # standings, falls, severities — the bottom of the analysis
│   ├── shape.ts                # the shape of a whole game, read off its eval graph
│   ├── settings.ts             # the thresholds the analysis is a judgement about
│   ├── verdict.ts              # the second pass: what kind of mistake a marked move was
│   ├── termination.ts          # one ending vocabulary across the two providers
│   ├── auth.ts                 # signInWithGoogle / signOut
│   ├── firestore.ts            # profile, games, openings CRUD
│   ├── sync.ts                 # client calls to the provider routes
│   ├── opening.ts              # position keys, opening parsing, matching
│   ├── pattern.ts              # thematic patterns: kinds, PGN parsing, tag plumbing
│   ├── upload.ts               # a pasted PGN turned into ordinary game documents
│   ├── accuracy.ts             # centipawn loss over time, mistakes by think time
│   ├── days.ts                 # day keys, the 6am rule, calendar arithmetic
│   ├── plan.ts                 # study plans: weeks, dates, counted tasks, progress
│   ├── plan-draft.ts           # a plan edited and not yet saved, kept on the device
│   ├── rating-history.ts       # daily closing ratings, the tracked pools, series
│   ├── version.ts              # which build this is, from Vercel's commit env var
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
- **Game phases are the user's own named segments**, in their own move numbers, and they
  are a setting rather than a constant. `phases` on the account holds only where each one
  *begins*; `gamePhases` in `lib/clocks.ts` turns that into ranges, each ending where the
  next starts and the last running to the end. Contiguity is therefore not something to be
  careful about — the original sketch had 16-30 and 30+ both containing move 30, and that
  is now unrepresentable, because there is no second number to disagree with the first.
  The defaults are opening setup (1-4), variation development (5-10), structure definition
  (11-15), tactical / strategic duel (16-30), pre-endgame (31-50), endgame (51+); the last
  two were one bucket of 581 games until it was split.

  The editor does *not* sort as you type. It did, and setting a phase to start at move 4
  re-sorted its row to second place halfway through typing "45", so the "5" landed in
  whichever field had taken its place — the same shape of bug as a tag picker that closes
  itself when you pick the first tag. It tidies on blur instead, and a phase whose
  successor starts before it does reads `empty` until then.

  The label is also the stored filter value (`?phase=11-15`), so moving a boundary renames
  a phase and a link to the old one stops matching. That is the honest outcome: the slice
  it named no longer exists.
- **A move is graded by the band it fell out of, not by what it cost.** Centipawn loss
  asks "how much did this cost"; the question is "what did it cost *you*", and from a won
  position those have different answers. Simplifying from +9.0 to +3.5 gives away five
  pawns of evaluation and changes nothing about the game. Under the old rule that was a
  blunder, which made the winning band the noisiest row in every table and most of it
  noise — the fault rate there fell from 9.5% to 4.1% when this landed, and `winning` went
  from one of the worst bands to the safest. So: staying in your band is an **inaccuracy**
  whatever it cost, falling out of it is a **mistake**, and falling further is a
  **blunder**. Two falls are graded softer than their distance suggests, and both earn it
  at an end of the scale where the band has no floor or ceiling to measure against.
  `winning → better` is the only one-band fall that does not change what the position is
  for: you were on top and you are still on top. `losing → mated` is its mirror — a
  position already lost has no better move to point at, so marking the move that ends it
  would be blaming you for that one rather than for the twenty before it. It is the one
  fall into mate that is not a blunder.
- **One function grades the move you played and the candidates you did not.** `gradeOf` in
  `lib/bands.ts` returns a severity or null; `classifyMove` turns it into a mark and the
  second pass turns it into whether a candidate held. They were two rules in two units
  saying nearly the same thing, and a move could be flagged while the second pass counted
  it as having held — which is exactly what turned up on a real row. A test walks 30,000
  evaluation pairs and asserts the two can never disagree.
- **The threshold is part of that rule, and leaving it out was the first attempt's bug.**
  A band boundary is a line in the sand: +1.01 to +0.99 crosses from better to level and
  costs two centipawns. Grading that as a mistake is grading jitter, and counting it as a
  candidate that failed to hold is the same jitter wearing the other hat. `mistake` is now
  the only thing centipawns decide — whether a move is worth marking at all — and the
  blunder threshold is gone, because how bad a marked move is comes from the fall.
- **`?!` is recorded and shown only if you ask.** It was never shown at all, on the
  reasoning that it is the mark a context excused. That reasoning is now literal rather
  than approximate: an inaccuracy is a move that stayed in its band. `marks` on the account
  says which severities reach a screen, a count and a review, and defaults to `?` and `??`,
  which is what the app has always shown.
- **The engine runs in the browser by default, and on the server on request.** `setEngineMode`
  picks, per device, and `analyzePosition` hides which one answered — the four callers never know.
  Browser is the default because it is free; the server exists for phones, where the local engine
  is slow and the tab is suspended as soon as you switch app.
- **`/api/engine` has three deployment traps, all of which only appear in production.** They are
  worth knowing because each cost a build-and-run to find:
  1. `firebase-admin/auth` cannot be loaded at all — jwks-rsa 4.1.0 declares jose 6 and then
     `require`s it from CommonJS. So the token is checked against Google's `accounts:lookup`
     with the public web API key, which is what that key is for, and verified tokens are cached
     for five minutes so a game's eighty requests cost one round trip.
  2. `require.resolve` does not survive the bundler. Anything derived from `createRequire` has
     `.resolve` rewritten to return a module id, so the wasm path came back as the number 4626
     and the engine died with `4626.replace is not a function`. `findWasm` probes real paths
     instead and names what it tried when it fails.
  3. The package ships two 99 MB builds, and tracing them took one function to 306 MB against
     Vercel's 250 MB ceiling — the deploy would have failed on upload. `outputFileTracingExcludes`
     keeps only the lite single-threaded build, at 3.5 MB.
- **The engine runs in the browser**, Stockfish 19 lite single-threaded in a worker, copied to
  `/public` on postinstall and gitignored. Single-threaded is deliberate: the multi-threaded build
  needs cross-origin isolation headers. Lite is equally deliberate: the full build ships a 99 MB
  NNUE network against the lite build's 1.8 MB, which is not something to hand a browser. An
  upgrade renames the files, so the copy script sweeps the previous version out of `/public`
  rather than leaving it to be deployed for ever. Requests are queued rather than rejected when busy, and
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
- **Clock readings are in move order on both providers**: reading `i` belongs to ply `i`.
  chess.com puts `{[%clk h:mm:ss]}` on every move in the PGN; lichess returns a `clocks` array
  that is *sometimes* one longer than the move list, carrying the clock as the game ended after
  the last move. `alignClocks` therefore drops anything past the move list from the END.
  It trimmed the front for a long time, on the stated belief that lichess prepends the starting
  clock — it does not, and the shift handed every player's think to their opponent on any lichess
  game that carried the extra reading. The check that settled it: against one game's own PGN,
  `clocks[i]` agreed with ply `i` on 107 of 107 plies and the shifted reading on 1. Note that
  games synced while the trim was wrong are stored shifted and cannot be repaired at read time —
  the first reading was dropped at sync — so they need a re-sync. `timeSpentPerPly` diffs each
  ply against two plies back and adds the increment, because a reading already includes it.
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
- **Each row in the game list says what has been done to that game** — `◆ reviewed` in blue, the
  engine depth as a violet `⚙ d21`, and what the engine found when it found anything —
  `2??` in red and `1?` in amber.
- **Status is a tag, findings are a figure.** Both views use the same two markers — `◆ reviewed`
  in blue, `⚙ d21` in violet — and in both views they are bordered pills, rendered by the one
  `StatusTag` component so the two cannot drift. In the game view they sit in the title beside
  the result, because "the engine has been over this at depth 21" is a state the game is in, not
  a measurement. What the engine actually *found* is a separate figure below, `2?? 1?`, with no
  depth in it. Keeping the depth in both places made the header read as though the number of
  blunders were somehow 21-ish. The depth badge shows on every
  analysed game, including a clean one: without it a game the engine found nothing in looks
  exactly like a game the engine has never seen, which is the one thing the badge is for. The
  Engine filter has a matching `Not analysed yet` to list what is still missing.
- **The engine's colour is violet, and that is the whole reason for it.** It was yellow, which
  sits in the same family as the amber a mistake is written in, so `⚙ d21` and `3?` beside each
  other in a game row read as one thing in two shades. Violet is clear of the amber, of the red a
  blunder uses and of the blue of a review. `no engine` stays plain muted text rather than a
  pill — it is the absence of a status, not one.
- **A review is four questions about at most three moves.** The method is borrowed from
  incident root-cause analysis: what you were doing, what failed, what would have caught it, and
  what to do instead. `MAX_REVIEW_MISTAKES` is 3 on purpose — a post-mortem that blames every
  move explains nothing, so the cap forces a choice. Each entry asks, in order: **why you played
  it**, why it is a mistake, what you could have seen or worked out, and what you would play
  instead. Proposed moves are validated against the position with chess.js and only the legal
  ones are stored, since the point is a move you could actually have played. Each proposed move
  is a row of its own with its own reasoning: a bare move is a line to memorise, while the reason
  is the part that transfers to the next game.
- **One mistake can cover several moves.** The same idea missed for four turns running is
  one thing that went wrong, not four, and writing it up four times would say the same
  sentence four times and count the tag four times — letting one bad evening outweigh a
  month. An entry carries `repeats`: other marked moves it also speaks for. They hold the
  move and nothing else, because the parent's cause, tags and alternatives are already
  theirs, and `missingFrom` asks them for nothing. The cap stays at three because it counts
  *entries*: it is there to stop three unrelated explanations, not to stop one explanation
  covering the four moves it actually covers. A ply claimed as a repeat leaves the list of
  moves to take apart, so nothing can be both a parent and a child. `tagsOf` counts the
  parent once, which is the whole point; `reviewedPlies` returns both, so the move list
  marks every move the review speaks about rather than only the ones with an entry under
  them. Absent on everything written before this, and read through `repeatsOf` rather than
  migrated — same habit as `betterMovesOf`. It is written to Firestore only when there are
  any, since an `undefined` field rejects the whole document.
- **The first question is what you were trying to do, and it came last.** Without it a review
  records that a move was bad and never records the thinking that produced it, which is the part
  that repeats — the same faulty idea reaches for a different move next game. `intent` is
  optional in the type and in `missingFrom`, because reviews were written before it existed and
  they are not wrong for lacking it; an entry still needs a cause and a tag, and nothing else
  changed. Old entries open with the field blank.
- **The labels are first person and the hints are not.** The questions are the ones you ask
  yourself, so they read "Why did I play it?"; the hint under each is a noun phrase rather than
  the form addressing you as "you", because a question in one voice answered by a prompt in
  another is what made the old wording read oddly.
- **An alternative is a line, not a move** — up to ten moves each side (`MAX_LINE_PLIES`), typed
  as "Nd5 Bxe7 Qxe7" with move numbers tolerated and stripped. Only the *first* move is judged by
  the engine, and only the first is what a drill asks for, because the rest depends on the
  opponent playing along; the continuation is still worth recording, since it is the plan you
  were actually counting on. An illegal move ends the line there, and the legal prefix is kept
  rather than the whole row being thrown away.
- **Saved lines are nested in the move list**, under the move they replace, the way a board's
  analysis panel shows a variation — not under the board, where they were only visible while you
  happened to be standing on the branch ply, and easy to miss entirely. Every move of a line is
  its own button, so a line can be joined part way rather than only played from its start, and
  the reason you wrote sits under it as the commentary. Clicking one hands the controls to the
  variation; stepping back past its first move returns to the branch point, as do `⏮` and
  "leave the line" in the list's header. The clock and evaluation readouts hide while a variation
  is open, because neither belongs to a position that was never reached.
- **`betterMoves` has had three stored shapes** — a plain SAN string, `{ san, why }`, and now
  `{ line, why }` — and `betterMovesOf` converts the older two on read rather than migrating the
  documents, the same habit as the pre-game ratings and the variation tree.
- **Your alternatives are judged by the rule that judged your move.** Each legal one is
  evaluated — the position before it and the position it leads to, both at `REVIEW_DEPTH` so the
  two numbers are comparable — and run through the same `classifyMove`, so an idea that answers a
  blunder with another blunder is marked `??` right there in the form. It is the whole value of
  writing the alternative down: finding out the fix is also losing. Debounced and keyed by
  `ply:san`, on top of the engine's own FEN cache, so typing does not queue work.
- **A review can be a note with no entries.** A game where nothing went wrong still deserves to
  be marked as looked at, or it keeps coming back as unfinished business. `hasReview` therefore
  asks whether anything was written at all, entries *or* a note, and the form refuses to save a
  document that is empty of both.
- **The drill passes any move that holds, not the engine's first choice.** It would be easy to
  mark only the stored answer correct, and wrong: the whole method is about finding something
  that keeps the game alive rather than reciting a line, which is why the review form says the
  same thing. `judgeAttempt` labels which it was — your own alternative, the engine's move, or
  something else that gives nothing away — and all three count. Only a move `classifyMove` calls
  a fault is a miss, judged by the rule that judged the original mistake.
- **A drilled position opens with nothing given away.** The move you played, your alternatives,
  your notes and the tags are all withheld until you answer, since any of them would hand you
  the answer. The engine's evaluation is fetched while you think, so committing is instant.
- **Drill records live in `drills` on the game, keyed by ply**, not inside the review. A position
  the engine flagged and you never wrote up can still be drilled, and it needs somewhere to keep
  score; keying by ply also survives a re-analysis. `merge` on a map field merges keys, so two
  positions from one game never overwrite each other.
- **Hardest first, and the queue never re-sorts under you.** Positions you have never seen lead,
  then the ones you keep missing, then the longest ago. A session's answers are layered over the
  queue rather than written back into it, because re-sorting after every answer would move the
  next card while you were looking at it.
- **"Hard to find — no clear way I could have seen it" is the escape hatch, and it is not a
  shrug.** It sits last in an entry, after the tags, because it is the conclusion you reach once
  you have tried to name the pattern and found there isn't one. The wording deliberately says
  nothing about the engine being right: the question is whether *you* had a way in. The entry is
  stored and then left out of everything that counts: `trainableMistakes` drops it, so it reaches neither the tag
  table nor the tag filter, and `buildDrillCards` subtracts it in *both* modes — the engine still
  flags the move, so drilling `all` would otherwise hand it straight back. Those two using the same rule is what makes a row in the table and
  the games behind it the same set. A move marked this way needs no answers; everything else
  needs a cause and at least one tag, or it adds a row that says nothing.
- **A pattern's name is its review tag.** That one decision is what connects the two
  halves: the tag table, the tag filter, the export and the drill all work on strings
  already, so a pattern becomes something you can count and filter by without any of them
  learning what a pattern is. Only two places know the difference — the review form offers
  your patterns as their own group above the fixed vocabulary, and `tagGroup` calls them
  `Pattern` rather than `Your own` when it is handed the names. The cost is that renaming a
  pattern leaves the old name behind on reviews already written, where it survives as an
  ordinary free tag; rewriting it everywhere would be a write per affected game, and the
  old name is still true about what you thought at the time.
- **A pattern's line is a whole game pointed at a move, not a position.** A FEN would have
  been less to store and would have thrown away the two things worth keeping: how you get
  there, which is what tells you a pattern is coming, and what it was worth afterwards.
  `startPly` is only where the board opens — every line steps anywhere in the game from
  there, and `⏮` returns to the pattern's own move rather than to move one, because that
  position is why the line is there at all. A board editor was the alternative and is
  strictly more work for strictly less: these patterns come out of games you played.
- **A pattern has examples, and none of them is the main line.** It held a `main` line
  beside a list of `examples`, which quietly borrowed the shape of an opening — where a
  main line is the one everything else is a variation of. A pattern is not an opening: an
  endgame idea has no main line at all, and even for an opening pattern the first game you
  happened to write up is not the canonical one. So there is one list, the first entry is
  first only because it was added first, and every entry can be removed. `normalizePattern`
  folds an old `main` in as the first example on read; `updatePattern` has to `deleteField`
  it, because an update merges and a field nobody writes still sits in the document — it
  would be put back at the front on the next read, so a line you had just removed would
  reappear.
- **A line is annotated move by move, and the annotations are a list.** A pattern's note
  says what the line is for; what is worth saying about one move belongs to that move.
  Comments are keyed by how many half-moves have been played — `7` is the seventh of them,
  `0` the position before anything — rather than by the move itself, because the same move
  can appear twice in a game and the two are not the same thing to say. They are shown as
  a list beside the board rather than only the one for wherever you happen to be standing:
  a line's annotations are what you came to read, and finding them by stepping through
  eighteen moves is not reading. Clicking one puts its move on the board, and the move
  strip under the board marks the same moves with a dot, so the two directions meet.
- **A pattern's line is a tree, like everything else that is a line.** It was
  `moves: string[]` with comments in a map keyed by half-move, read by `LineBoard` —
  which could hold one line, no branches, and had its own cursor. The PGN is the
  authority now, because it is the only field that could ever hold a branch, and
  `lineTree` reads it; `MoveTreeBoard` draws it, so a pattern board gained move input
  and variations at the same time as the game's did, and `LineBoard` is gone. A
  pattern usually has an "if they play this instead" in it and there was nowhere to
  put one.

  Comments moved onto the moves, which is where PGN has always put them and the only
  place that still means something once a line can branch — ply 7 names one move on a
  line and several on a tree. Old ones are grafted onto the main line on read and
  dropped on write, the same habit as `main` folding into `examples`; leaving them
  would have the next read graft a stale copy back over the top.

- **The board's cursor lives outside the board.** `useLineCursor` is a hook rather than
  state inside `LineBoard`, because whoever shows or edits a move's comment has to know
  which move is on the board. That is what lets the commentary sit beside the board in the
  reader and under it in the editor, instead of both being squeezed into the board's own
  column. `moved` stays null until you actually step, so while you are still pointing a
  line in the editor the board follows `startPly` as you change it.
- **A pattern board is read at the size you would study at**, 28rem, with the commentary
  beside it — and the split waits for `lg` rather than `md`. At tablet width a
  two-column row squeezes the board back to the 20rem it was before it was made bigger,
  which is the opposite of the point, so below that the commentary stacks underneath.
- **When a pattern applies and where it turns up answer the same question**, so they sit
  on one row above the board rather than one on each side of it, and the openings are
  pills: two underlined links side by side read as one long name. The row wraps rather
  than being a two-column grid, so a pattern carrying only one of them gets the whole
  width instead of half and a gap.
- **Each line carries its own orientation.** A pattern nearly always belongs to one side —
  the note that prompted this says "Black - Catalan" — and read from the wrong end it is a
  different idea. Lines written before the field existed read as White.
- **A pattern is filed under one of four kinds**, tactics / strategy / development /
  endgame, each with its own colour. The list is short on purpose: a pattern you cannot
  file under one of them is usually two patterns.
- **The PGN is kept exactly as pasted, beside the parsed moves.** Re-pointing a line later
  means reading the game again, and a typo mid-edit must not throw away what you pasted —
  so a PGN that fails to parse keeps the text, shows the error, and leaves the board on the
  last moves that did parse.
- **Patterns are read from the server, like plans.** Two reasons, both the plans
  argument: there are a handful of them rather than a thousand, so a fresh read costs
  almost nothing, and they are written on one device and read on another. It bit in
  practice — a browser whose cache held one of four patterns showed one pattern, and
  the copy it showed predated its own comments. `readDocs` trusts any cache that is
  not empty, so a partial one is indistinguishable from a complete one.

- **Thematic patterns live in `thematicPatterns`**, not `patterns`: the saved opening lines
  hold that collection id and are not moving for a cosmetic reason. See the note in
  `lib/firestore.ts`.
- **Tags are a fixed vocabulary you can extend.** `TAG_GROUPS` in `lib/review.ts` groups them by
  what actually broke — tactics missed, tactics allowed, calculation, strategy, endgame, opening,
  mindset — because a count is only comparable across months if the words stay the same. The
  groups carried a one-line gloss each; the names say it.
- **A search fails in three ways, and they are three tags.** The move was never a candidate
  (`never considered the move`); it was a candidate, got cut, and was good (`abandoned a good
  line`); or the whole think ended before it was finished (`stopped calculating too early`).
  Dropping a line you had already started is not the same as never starting, and neither is the
  same as playing before you were done — one list could only name one of them.
- **Tactics have a direction, and it is two different mistakes.** Missing a fork your opponent
  left you is a failure to look; walking into one is a failure to check what your move allows, and
  the training for each is nothing like the other. A single list of bare motifs — `fork`, `pin` —
  could only ever mean one of them, and it read as the missing kind, so there was no way to record
  hanging a piece. `Tactics allowed` holds the other direction, with each tag saying so on its own
  (`hung a piece`, `allowed a fork`) since a tag appears alone in the mistake table. The existing
  tags were not renamed: only the group was, from `Tactics` to `Tactics missed`, and group names
  are derived at read time while tag strings are stored — so nothing already written was
  orphaned. Free tags are still allowed
  and are offered back as suggestions (`knownTags`), landing in a "Your own" group.
- **Reviews live on the game document**, like the analysis, not in a subcollection. The dashboard
  already holds every game, so filtering by review state, counting tags and finding the next game
  to review cost no extra reads. `saveGames` merges, so a re-sync never clears a review.
- **Entries fold.** Three moves of questions, lines and tags is a long form, so each entry has a
  `+`/`−` and collapses to its move, its evaluation and either its tags or "Hard to find". Ones
  loaded from a saved review start folded, since they are already written; a new one never does.
- **The board sits in a full-width row**, taking whatever is left beside the move list, so the
  section is as wide as every other box instead of a narrow island between them. The track is
  `minmax(0,1fr)` rather than content-sized: a content-sized one took its width from the readout
  *under* the board and resized the board from move to move.
- **The move list is the board's height, and absolutely positioned to stay that way.** Three grid
  cells, not two — board, controls under it, list beside both in the board's row alone, so the
  controls' height does not push it past the board. `h-full` was not enough on its own: the row
  is auto-sized, so a long game made the list define the row and then fill it, and forty moves
  ran hundreds of pixels below the board. Out of the flow, the board alone sets the row height
  and the moves scroll inside it. On a phone none of this applies: everything stacks and the list
  is capped at 28rem.
- **The move list scrolls itself and never the page.** Keeping the move you have just
  stepped to in view is `scrollIntoView({ block: 'nearest' })`, which is also what made the
  game view unusable on a phone: it scrolls *every* scrollable ancestor up to the document,
  and on a phone the list is stacked under the board rather than beside it — so each move
  dragged the board off the top of the screen to bring the list into view. Every move of
  every game did it. `MoveList` applies the same rule by hand to its own scroller, measured
  with `getBoundingClientRect` rather than `offsetTop`, which would be relative to whichever
  ancestor happens to be positioned — and that differs between the two layouts. Checked
  against a real layout: a row already in view does not move it, one past either edge comes
  flush to that edge, the list lands on the identical `scrollTop` either way, and the page
  stays where it was instead of jumping 1500px.
- **The tag picker holds its own open state per entry.** Deriving it from "has no tags yet" read
  well and behaved badly: picking the first tag closed the picker under you, and tagging a move
  usually takes more than one. It is a button and a conditional, not `<details>` — React nulls
  `currentTarget` on a toggle event, and reading it there crashed the page.
- **Evaluations are stored from your side and shown from White's.** The two frames exist for
  different jobs: `cpLoss` has to mean what *you* gave away and `classifyMove`'s guards ask
  whether *you* were already lost, so everything stored and every rule is in your frame. Boards
  are not — positive favours White whoever is reading — and a Black player shown a raw stored
  `−2.2` reads "I am winning" when it means the opposite. `formatEval(cp, color)` in
  `lib/review.ts` flips the sign at the point of display and is the only place that does; the
  export keeps the stored frame, which is what its field comments say.
- **One depth, `ENGINE_DEPTH` (21), and no picker.** It covers a game's analysis, the engine's
  choice on a move, the verdict on an alternative you typed, and the drill. Splitting it into a
  careful depth and a fast one was tried and was wrong: these numbers are read side by side, your
  alternative against the move you played, and two depths in one card make the comparison
  meaningless. A quiet middlegame position costs about 1.3s at 21, so a 40-move game runs about a
  minute and a half.
- **The measurement is stored; the judgement is derived.** This is the rule the whole
  analysis layer now follows. What costs engine time is kept — `cpBefore`/`cpAfter` on
  every move, and on a verdict how many candidates held, what was on the board, which
  moves were looked at. What is only an opinion about those numbers is recomputed on
  read: `normalizeAnalysis` re-derives every `??`/`?` and the counts, and `verdictsOf`
  re-derives the verdict kind. Thresholds are judgements and judgements move — `DECIDED`
  went from two pawns to three, `only-move` became `concrete-line` at two moves, level
  narrowed to a pawn either way — and each of those would otherwise have meant re-running
  the engine over every stored game to ask the new question with the old answers on disk.
  Changing a band is now a constant and a deploy. (`annotatedPgn` is the exception: it is
  a copy of the game written once, and carries the marks of the analysis that produced it
  until the game is analysed again.)
- **The verdict and the grade come off one table.** `TRANSITIONS` in `lib/bands.ts` has a
  row per fall carrying both what it costs and what it is called, so a severity and a
  descriptor can never drift apart — and the screen that explains them is one table with a
  column for each.
- **The verdict is a fall, not a starting point.** Where you landed is half the event:
  coming down from winning to a position that is still better is not the same as coming
  down to level, and neither is the same as coming down to lost. A label per starting band
  could only ever say the first of them. So `TRANSITIONS` is a table of from → to, and the
  breadth picks the column.

  | the fall | sharp | tight | stable |
  |---|---|---|---|
  | winning → better | missed the kill | slowed it down | let the win go |
  | winning → level | lost the thread | let it slip | threw it |
  | winning → worse | lost the thread | turned it around | threw it away |
  | winning → losing | lost a won game | lost a won game | handed over a won game |
  | better → better | missed the sharpest | took the slow road | eased off |
  | better → level | missed the follow-up | mishandled the edge | let the edge go |
  | better → worse | missed the follow-up | lost the plot | gave it away |
  | better → losing | lost it in one | lost it in one | gave the game away |
  | level → level | missed a chance | drifted | a loose move |
  | level → worse | missed the line | went the wrong way | a careless move |
  | level → losing | lost it in one | came apart | gave the game away |
  | worse → worse | missed the defence | defended badly | made it worse |
  | worse → losing | missed the defence | cracked | let it go |
  | losing → losing | missed the save | hung on badly | already lost |
  | anything → mated | walked into mate | walked into mate | walked into mate |

  The columns are three different failures, and the names say which: a `sharp` position
  had a line in it, so its names begin `missed`; a `tight` one had a few playable moves;
  a `stable` one forgave anything, so its names say what you did with all that room. Cells
  still share a name where the distinction stops carrying anything, but *where you landed*
  is no longer one of those places. `winning` and `better` used to merge `worse` with
  `losing` on the grounds that falling to either is the same mistake twice over — which
  `level` never believed, since it has always had a row for each, and which the data says
  is wrong: from better, a move landing in `worse` costs a median 342cp and one landing in
  `losing` costs 650cp, and both were called `missed the follow-up`, as was the one-band
  fall to level at 161cp. One name over a slip worth a pawn and a half and a collapse worth
  ten.

  That was the `sharp` column's doing more than the merge's. It named the *failure* —
  there was a line and I missed it — and said nothing about where the miss left you, so it
  read identically from `winning → level` and `winning → losing`: 105 moves under
  `lost the thread`, 154 under `missed the follow-up`, 181 under `missed the line`. The
  landings that end the game now say so, because a name that sounds like a missed
  opportunity is the wrong thing to read on a game that is already over: `lost it in one`
  where a playable game became a lost one in a single move, and `lost a won game` where
  what was lost was already won. The badge is coloured by where you fell *from*, which is the
  axis that says how much was at stake; the landing and the breadth are words beside it,
  because three hues is three things to decode on a row you scan.
- **The table is total, and most of it is unreachable.** A fault never leaves you winning
  (`classifyMove` will not mark one that does) and is never played from a position already
  lost, so the `winning → winning`, `losing` and `mate` rows exist only so that no
  evaluation anyone ever sees can fall through it. The screen that explains the table
  leaves them out; the code keeps them, because a table with holes is a crash waiting for
  the first position nobody expected.
- **`mate` is a band, and it is the floor.** An evaluation past half of `MATE_SCORE` is
  the engine counting moves to mate rather than material, and there is nothing below it to
  fall into — which is the whole reason it is worth separating from `losing`. There is no
  matching band at the top: a forced mate *for* you is just winning, and you cannot lose a
  game by climbing.
- **A move holds when it keeps your band, not when it stays within a mistake of the
  best.** The old rule asked a centipawn question where the question is a band one. From a
  won or better position a candidate must leave you at least better, from level at least
  level, from worse at least worse — so four pawns given away out of nine still holds,
  because it is still a won game, while half a pawn given away at level does not, because
  it crossed out of level. Winning and better share a floor: coming down from +6 to +2 is
  not losing something you were holding.
- **The engine says how much a move cost; the second pass says what kind of mistake it
  was.** "You dropped four pawns" does not distinguish being a rook up and giving it back
  from failing to find the only move that held a position worth four pawns — different
  mistakes, different training, and a tag table that cannot tell them apart sends you to
  the wrong one. The second pass reads three things off the position before each marked
  move: your **material**, the engine's **score**, and **how many of its candidates held**.
  The last of those is the breadth, and it decides which column of the transition table
  the descriptor comes from.
- **Breadth is three buckets, not two.** `sharp` is one or two moves holding, `tight` a
  few, `stable` everything the search looked at. `tight` rather than `open`, which reads
  as an open position — a real and different thing these need not be. Two was too coarse at the top: holding on
  three of five is a position with room in it, holding on all five is a position that
  forgave anything, and failing those is not the same failure. `sharp` is `narrow` on the
  account — two, because the same idea often has two move orders and a position with one
  answer written twice is still a position with one answer. `stable` is measured against
  what was *looked at* rather than against the setting, so three legal moves with three
  holding counts as having forgiven anything, which is what it did.
- **"How many moves held it" is one MultiPV search, not one search per move.** Asking the
  engine about each legal move separately would be forty searches and — worse — forty
  separate searches, which cannot be compared with each other any more than two depths
  can. One `MultiPV 5` search returns five lines scored against each other, and a move
  "holds" when `classifyMove` would not call it a fault, which is the same rule that
  marked the move in the first place.
  `analyzeLines(fen, depth, count)` is the entry point for both engines, `analyzePosition`
  is the one-line reading of it, and the cache records how many lines were asked for so a
  position with three legal moves does not look uncached for ever.
- **A dedicated search beats a shared one, and `reconcile` is where that is decided.**
  The reference used to be `moves[0].cp` from the MultiPV search itself, on the reasoning
  that comparing numbers across two searches is the depth trap in another costume. The
  trouble is that it puts two readings of one position on the same row. Both passes run at
  depth 21 and they do not agree, because MultiPV has to keep five lines alive and so
  searches each of them less: across 633 marked moves the two readings differ by a median
  of 20cp, and 17% of them land in *different bands*. That is what produced
  `better → level · stable 5/5` on a real row — the mark came from +101 (better) and the
  breadth from +87 (level), with the band edge at 100 between them, and the move you
  played was among the five that "held".

  So the first pass's numbers win wherever it has one. It evaluated two of these positions
  on their own: the one before your move, which is what best play is worth and is now the
  reference, and the one after it, which is what *your* move is worth and is now its entry
  in the candidate list. Everything else keeps its MultiPV score, because nothing better
  exists for it. The cost is real and is the old note's point: the list now mixes two
  searches. It buys the thing that matters more — the move you played is graded against
  the same number that marked it, so the two passes cannot contradict each other about it.
  Marked moves that counted as holding went from 45 of 242 to 0.

  Direction was the thing to check before trusting any of it, since a one-sided gap would
  inflate `sharp` by construction rather than measure it. Between two searches at the same
  depth it is close to even — median +4cp, single-PV higher in 57% of positions and lower
  in 37%, same band 93% of the time.

  The first reading of that said median 0cp and 17% band disagreement, and it was wrong,
  because the sample mixed depths: half the analysed games were still at the old depth of
  12 while the second pass has always run at 21. Matched pairs disagree about the band 7%
  of the time; the depth-12 ones disagreed 29% of the time and ran 54cp low on average. So
  most of what looked like a MultiPV artefact was a depth artefact. `reconcile` takes both
  depths and falls back to the search's own top line when the first pass is the shallower
  of the two — nothing in the data carries a shallow analysis now, but `ENGINE_DEPTH` has
  moved once already, and on the day it moves again every stored analysis is shallow.

  All of it is derived on read. `cpBefore`, `cpAfter` and the raw MultiPV scores are the
  measurements and all three stay on disk untouched, `best` included; every verdict
  already stored re-reads under the new rule for free, and nothing needs the engine again.
  One approximation is worth knowing: the first pass does not store *which* move it
  thought best, so the top line is shown carrying `cpBefore`. That is the value of best
  play either way, but if the two searches preferred different moves it is the value of a
  move the list does not name.
- **A multi-line search clears the hash first, and that is what makes a verdict
  reproducible.** The second pass turns small differences between candidates into a
  category, and a hash carrying the rest of the game moves those differences: one position
  in this data came back 5 of 5 holding on a cold engine and 2 of 5 after the first pass
  had swept the game — a different verdict for the same move, decided by what happened to
  run before it. `ucinewgame` before each MultiPV search makes every reading depend on the
  position alone. A single-line search keeps its hash, where the answer is one number and
  the first pass depends on the speed. It also means a stored `holds` from before this is
  not comparable with one after it, which is what the re-read button is for.
- **`holds` is at its least certain where the candidates cluster.** The count asks whether
  a move loses more than a mistake's worth, so five moves sitting within a few centipawns
  of the threshold all flip together: a move at +1.12 against four at ~0.0 is a 110cp gap
  against a 100cp rule, and a 15cp wobble takes `holds` from 1 to 5. The reading is sound
  where the field is spread and brittle where it is tight, which is one of the things the
  `×` is for.
- **Nothing written to Firestore may be `undefined`.** It rejects the whole document, not
  the field — so carrying a dismissal forward through a re-read as
  `dismissed: previous?.dismissed` failed every save with "Unsupported field value". The
  flag is added only when it is true. Optional fields are set, never assigned undefined.
- **The second pass runs on the marked moves only, and that is the whole reason it is
  affordable.** A MultiPV search costs five times a plain one — 6.2s against 1.3s at depth
  21, measured on real positions — so running it over a whole game would be four minutes
  against the first pass's two. Faults are 7% of your moves, about 2.7 a game, which puts
  the second pass at under twenty seconds. It also skips moves already judged, so it
  resumes rather than restarting.
- **An analysis carries the version that wrote it.** `ANALYSIS_VERSION` is stored on
  every analysis and `isStale` compares it; the dashboard's Engine filter has
  **Analysed by an older build** beside **Not analysed yet**, and such a game's depth
  badge turns amber and says `old`. It tracks the *measurements* only — the depth, and
  what is recorded per move. Every judgement is derived on read, so moving a band,
  renaming a descriptor or changing what counts as a fault leaves every stored analysis
  exactly as valid as it was. The rule: if re-running the engine would produce different
  **numbers**, bump it; if it would only produce different **words**, do not. Analyses
  written before the field existed are classified on read rather than migrated — depth is
  the only measurement that has ever moved, so `ENGINE_DEPTH` means version 1 and anything
  shallower means 0. `isComparable` is now this and nothing else, so one rule decides what
  belongs in an average. It exists because 138 analyses sat at depth 12 for months after
  the depth moved, invisible except to someone who went looking: a shallower engine finds
  fewer mistakes *and* scores them smaller, so they dragged every figure down in a
  direction nothing on screen could show. `markedMoves` and `ownMoves` in the analysis
  skill skip them too, which is where that went wrong in the first place.
- **Material is derived for every move, not stored.** The second pass records what was on
  the board for the moves it reads, which answers "what was in front of me when I went
  wrong" and cannot answer "how often do I go wrong a pawn down" — that needs the same
  reading for the moves where nothing went wrong, which is most of them. Storing it per
  move is the obvious fix and the wrong one: material is a pure function of `game.moves`,
  already on disk, so `materialByPly` replays the game once and has it for every ply of
  every game the app has ever seen — including the thousand the engine has never looked
  at. No re-run, no new field, no migration. Checked against all 712 readings the second
  pass had stored independently: the pawn difference agrees on every one, and so does the
  full inventory wherever the older verdicts carried it. The stored copies stay, because
  they are what the second pass measured and removing them would be churn.
- **The verdict keeps the board, not just the difference.** `pieces` holds what each side
  has, by type, kings aside — the difference falls out of it and the inventory answers
  what the difference cannot: whether the queens were off, whether this was a rook ending,
  whether a level position was level with two pawns each or two queens each. "Every
  mistake I make in a rook ending" is not a findable slice without it. `materialBy` is the
  older, thinner field and is still read for verdicts written before this.
- **The imbalance is figurines on the row and a sentence on hover.** `♟♟ / ♝` is read at a
  glance where "2 pawns for a bishop" has to be read; the row is scanned, not studied, and
  the words are a `title` away. Only the side that is up is drawn — the same thing a
  captured-piece strip shows, and the only part carrying information. Solid black
  figurines only: one colour renders the same in every font, which is the trap the board
  itself hit with hollow white glyphs.
- **The candidate moves are kept, not just counted.** The search has already found five
  moves and scored them; throwing them away left "two of five held" answering a question
  nobody has in front of a board. The question is what to play instead, so the row expands
  to the moves themselves, the ones that held in green. It costs nothing — the work was
  done to produce the count.
- **What your opponent did is already in the stored analysis, and nobody was asking.** The
  first pass evaluates the position before and after each of *your* moves, so their reply
  sits bracketed between your `cpAfter` and your next `cpBefore`, both already in your
  frame. `opponentMoves` reads it out; `giftsFrom` names the replies that handed you a win
  you did not have. No extra search, no extra field, no re-analysis of a single game —
  which is why it is derived rather than stored, like everything else here that can be.
- **A material count has to say what it is counting.** `+3` is a knight to one reader and
  three pawns to another, and those are not the same position — reading "+1 material" off
  a row tells you nothing you can picture. So the verdict stores both: `material` in pawn
  units, which is what the rules weigh, and `materialBy`, the count per piece type, which
  is what gets written out. "a pawn up", "a rook for a knight", "level". It earns itself
  immediately on real data: the game that scored `+3` turns out to be *a bishop and 3
  pawns for a knight*, and one that scored `0` is *2 bishops for a knight and 3 pawns* —
  which is the two-bishop endgame the number flatly denied was anything at all.
- **Material is the thing the eval is not.** A score runs ahead of the material when the
  advantage is an attack, two bishops, a passed pawn — something you have to keep playing
  for. So `threw it` needs either a decisive material edge (`DECISIVE_MATERIAL`, a piece)
  or a score that is simply the material (`MATERIAL_SLACK`), and everything else winning
  is `lost the thread`. Both halves were needed: without the first, a piece up with an
  attack on top read as positional — including the one game in the data that was
  unarguably thrown; without the second, two pawns up scoring +2.6 read the same way.
- **A game has a descriptor too, and the result is a poor substitute for it.** A win is a
  forty-move squeeze or a gift on move nine; a loss is one you were never in or one you had
  won. W/D/L puts those together. `lib/shape.ts` takes them apart, off data already on
  disk: `cpBefore` and `cpAfter` for every move of yours, laid end to end, *are* the
  evaluation at every half-move the game passed through — your move and then the reply,
  alternating, all in your frame. Nothing is stored and nothing is re-run.

  It is the move descriptor one level up, and deliberately the same shape: a table of
  **arc** × **texture**, where the arc is what became of the lead (`held it`, `recovered`,
  `threw it`, `never had it`, `shared`) and the texture is how many times it actually
  changed hands (`steady`, `turned once`, `traded`). Two of the fifteen cells cannot
  happen — you cannot throw a won game or rescue a lost one without the lead moving — and
  are named anyway, for the reason `TRANSITIONS` keeps rows no evaluation reaches. The
  names avoid the move vocabulary on purpose: `threw it` and `lost the thread` already mean
  something precise about a single move, and one table reading like the other would suggest
  they are the same kind of thing.

  The series is clamped to ±1000 like the accuracy figure, or a single forced mate would be
  the whole of a game's measured movement; and the texture counts crossings of the *level
  band* rather than of zero, since drifting either side of 0.00 is not the lead changing
  hands.
- **The result leads and the ending breaks the tie; the graph says how you got there.**
  The arc read the final evaluation at first, on the reasoning that the graph is the honest
  story and a game lost on the clock from a won position is still one you held. On the row
  it appears on, that reads as a contradiction: `stole a wild one` against a loss, `a wild
  draw` against a win — both of which turned up. So the result picks the family (a win is
  `held it` or `recovered`, a loss is `threw it` or `never had it`, a draw is `shared`) and
  `peak`/`trough` colour it in. No name can disagree with its own result now, checked across
  every analysed game.

  Where the two genuinely disagree — 4% of games, every one a flag, a repetition, an
  abandonment or a resignation — the *ending* names the game outright, because that is
  what actually settled it and no reading of the evaluations will ever say so.
  `saved by the flag` is a game you were dead lost and won on the clock; `they resigned a
  draw` is an opponent who did not find it; `resigned a level one` and `flagged a won game`
  are the same thing from the other side, and both are in this data. The arc survives as
  the supporting figure — a game is still `recovered` on the grid when the flag saved it,
  which is true — and the panel's own list counts the name the game carries, so those few
  appear as themselves rather than hiding inside a cell.

  The table carves the real data: 13 of 15 cells populated over 270 games, the two empty
  ones exactly the impossible pair, and the arcs almost pure against the result — `held it`
  won 99%, `threw it` won 0%, `recovered` 95%.
- **Where a game turned is a number it already had.** `settledAt` walks back from the
  end to the last point in a different band from the one the game finished in — which
  is the moment *every* arc is named after, whichever arc it is: a game you recovered
  settled when you stopped losing, one you threw settled when you stopped winning, one
  you never had settled when it went. So the phase holding that point is the phase the
  game turned in, and `decidedIn` needs no rule per arc. The graph says "lost it in the
  tactical / strategic duel" where it used to say "settled with 23% left" — the same
  measurement, one of them in a form you have to convert before it means anything.
  `DECIDED_IN` is a second set of arc labels rather than `ARC_LABEL` with "in the" after
  it, because "never had it in the opening" says the wrong thing and "shared in the
  endgame" says nothing. It reads as well as you have named your phases, which is the
  point of their being yours.

- **The screens that explain a rule render the rule.** `AnalysisSettingsPanel` draws
  `TRANSITIONS` and `GameShapePanel` draws `GAME_NAMES` and `OFF_BOARD`, rather than
  describing them in prose beside the code. An explanation written separately explains what
  the rule used to be — which is why `offBoardOf` stopped being a cascade of `if`s and
  became a table the moment it had a screen: the cascade worked and could not be rendered.
- **The shape filter carries two widths in one field.** `shape` holds `arc:held` or
  `name:a clean win`, because "every game I threw" and "the particular way I threw that one"
  are the same question at two zoom levels, and a second dropdown for the second would be a
  row of the filter panel for something nobody asks twice. An unknown value is dropped on
  read rather than passed through, so a hand-typed URL cannot invent a category; an
  unanalysed game matches neither, since there is no graph to read. The panel's own rows are
  the other way in, the same habit as a variation row and a phase count: the figure you are
  reading is the filter you want next.
- **The graph is drawn from White's side, and the figures beside it have no side at all.**
  The player's frame was tried first, because "how did this go for me" wants up to mean
  good. It put two frames in one panel: a line rising to the right beside a figure reading
  −9.0, since every number on that page goes through `formatEval` and that flips. One of
  them had to move and the one with company stayed — the readout under the board, the
  engine panel and the review are all White's, as is every chess site. The axis names the
  colours and marks which one is you, and the figures are *band names* rather than numbers:
  "best you stood: winning" is true from either end of the board. The panel is folded by
  default and remembered, like the dashboard's.

  It is drawn the way a chess site draws one, because the first attempt was not and read as
  a widget: the chart runs flush to the panel's edges with `-mx-5`, like the two wide
  tables, since a chart inset by five millimetres of card looks like a control rather than
  the thing you came for. The fills are the dominant element and the line is thin over
  them. The phase dividers are the app's own `GAME_PHASES`, so the chart can be read as
  "this went wrong in the duel" rather than "four fifths of the way along" — only the ones
  the game actually reached, labelled under the stretch each owns, and the labels drop to
  their move numbers below `sm` because five words do not fit across a phone.

  Everything that must not be stretched lives *over* the SVG rather than inside it. The
  chart is `preserveAspectRatio="none"`, so a circle in its coordinates is an ellipse at
  whatever width the panel happens to be and text is worse; the colour markers, the phase
  labels and the engine's marks are absolutely positioned HTML on top. The marks are held a
  hair off each edge — one on the last move of a game is centred on the chart's own border,
  and half a dot outside it reads as a rendering fault.
- **The slice's verdicts are a dashboard panel, read from storage.** Every figure in it
  comes off disk — the verdict is derived from the marked move and the stored `holds`, so
  the table is there the moment the page is. What it cannot invent is a reading for a move
  nobody has asked about, which is why the coverage is in the heading rather than implied:
  a mix drawn from a tenth of the marked moves is a mix of whichever tenth happened to get
  opened, and a panel that did not say so would be quietly lying about a sample.
- **The panel is a summary and a detail, not two columns of equal billing.** It was
  eighteen descriptor bars beside a four-row grid, which made the grid an island in a
  column of whitespace half the height of the bars — and they are not equal things. The
  grid goes first, sized to its contents rather than stretched, best band at the top the
  way the transition table itself reads, and carrying its own margins: the bottom row is
  the figure anyone actually quotes off this panel, how a whole slice splits between a
  line to find and a position that forgave anything, and without it that had to be done
  by eye down a column. The list runs underneath, two columns deep, so eighteen names are
  nine rows. The grid then earns its place twice over, because it is also the legend — a
  descriptor's bar is drawn in the colour of the badge for the band it was said of, so
  the two halves of the panel read as one thing.
- **A descriptor says what it is the name of, on hover; the bar says which were yours.**
  `missed the line` is a cell of the transition table and means nothing on its own, where
  `sharp · level → worse` is the whole definition. It is a tooltip rather than a line on
  the row because the descriptors do not share evenly: twenty-nine of the thirty-two name
  cells of a single row and would read fine inline, while `walked into mate` names
  fifteen — so printing them would be four lines of noise on every row to serve the one
  that needs it. The recipe also drops the half of each row that exists only to make the
  table total, since a marked move never leaves you better off than you were:
  `losing → winning or better or level or worse or losing` is `losing → losing`.

  Three descriptors are said of two different bands, and for those the recipe raises the
  question it cannot answer by itself — `gave it away` is a stable fall from better *and*
  a stable fall from level, and which of them were yours is the part worth knowing. So
  `verdictTally` keeps the bands behind each descriptor, the bar is drawn in segments,
  and the tooltip prints your count against each line. Only where the lines have distinct
  bands: `missed the line` is two lines both from level, and a count against each would
  be the same figure printed twice. A band you have no readings from keeps its line and
  loses the figure, because the recipe is what the descriptor *is* and `— 0` five times
  over is not worth reading. For the other twenty-nine nothing changes: one band, one
  colour, no figures to disambiguate.
- **The second pass gets a slice-wide run; the first pass still does not.** The rule
  against batching was about cost, and the two passes do not cost the same: analysing a
  game is eighty positions, reading its marked moves is about three. A hundred games is
  minutes rather than hours, and the run is resumable — it skips what has been read, so
  stopping it loses nothing. It still says how many positions it is about to search before
  it starts, and it still stops on demand. The first pass has a queue rather than a slice-wide run,
  which is a different thing: a queue is still games you picked one at a time.
- **A verdict can be thrown out, and the rejection is stored.** `dismissed` is a flag
  rather than a delete, because running the pass again must not hand back a reading you
  have already rejected — and the row stays on screen, greyed, so it is on record as
  rejected rather than quietly gone. The ingredients sit beside the verdict on the row
  (`+1 material · 2 of 5 held`) for the same reason: it is a judgement, and you should be
  able to see what it was made from before accepting it.
- **Verdicts live in `verdicts` on the game, keyed by ply**, like `drills` — a `merge`
  write on a map field merges keys, so judging two more moves never clears the rest, and
  keying by ply survives a re-analysis.
- **Analysis is one game at a time, and you say which.** A batch panel over the filtered
  slice used to sit on the dashboard, and the trouble with it was how easy it was to point at two
  hundred games — hours of compute for games you were never going to read. There is still no
  control that means "all of these": the game list's own `⚙ analyse` is per row, and it shows only
  on a game the engine has never seen, so what gets analysed is still a series of decisions about
  particular games. What changed is only where the decision can be made. `EnginePanel` still
  gathers everything the engine does to one game in one box: what it found, where it runs, the
  button, and the annotated PGN. The depth tag stays up in the title, because that is a status of
  the game rather than part of the engine's controls.
- **One queue owns the first pass, wherever it was started from.** There is one Stockfish
  worker, and `terminateEngine` rejects everything in flight — so two `analyzeGame` calls
  against it are not merely slow: whichever finishes first kills the other on its way out.
  Reaching the control from a list is what made that reachable, since a list invites
  pressing twice. `lib/analysis-queue.ts` is therefore the only caller of `analyzeGame`:
  the row's button and the game page's both enqueue, the second press shows its place in
  the line, and the panels that run the *second* pass check `queueBusy` before terminating
  anything. It lives in a module rather than a page's state because the work is not the
  page's — a run started from a list has to survive opening one of those games to read it,
  which is exactly what you do while waiting, and a loop left in an unmounted component
  would go on writing to Firestore with nothing on screen to say so. The engine is left
  running between games on purpose: starting the worker costs a second and games from one
  opening share most of their early positions, so the FEN cache is worth more here than a
  clean slate, and the single-line searches of the first pass do not depend on the hash the
  way a MultiPV one does.
- **A stopped run leaves the screen at once, and a stopped run never counts as a failure.**
  `analyzeGame` only looks at `shouldStop` between positions, which is something over a
  second, so a control that waited for the unwind would sit there saying "Stop analysing"
  long enough to read as a click that missed. The queue drops the game from its state on
  the press instead — nothing is written until a game finishes, so there is nothing to
  take back — and ignores the progress callback from the position still in flight, which
  would otherwise put the game straight back. The failure it records is likewise guarded by
  that flag and not only by the exception type, because stopping is not the only way a run
  ends early: a second pass elsewhere calling `terminateEngine` rejects the position in
  flight with a plain error, and a game you stopped yourself must not then be labelled as
  having failed.
- **A clock reading says whose it is.** The readout under the board carries two numbers that
  both belong to the move highlighted on it — already played — and on an opponent's move they are
  *their* think and *their* clock. Left unattributed they read as being about the move you are
  looking for next, which is the opposite of what they mean, so they are written as a sentence:
  "Your opponent took 33s here, 10:01 left". Time left is formatted as a clock (`formatClock`,
  10:01) rather than raw seconds; time taken is a duration, which is a different thing and reads
  differently.
- **Every evaluation on screen shows both ends.** Where a move left you says nothing without
  where it started: `+7.4` reads as a disaster until you see it was `+6.0 → +7.4` in a game
  already gone, and worth no part of a review. That holds for the candidate chips, the entry
  header, each alternative and the drill.
- **The move you played is re-evaluated in the review form**, alongside your alternatives, and the
  entry header shows that rather than the stored numbers once it lands. The stored pair was
  written by whatever depth analysed it at the time — games analysed before the depth settled at
  21 still carry 12 — so leaving it on screen next to a depth-21 alternative invites exactly the
  comparison that cannot be made. The before position is
  shared with every alternative, so this costs one extra lookup per entry.
- **The engine says where to look; the review says why.** `reviewQueue` is analysed games with a
  blunder or mistake and no review yet, blunders first, which is what the "Review next game"
  button follows. The engine's own best move is available per entry but only on demand — after
  you have committed to your own answer, which is the point of writing it down first.
- **`lib/scope.ts` joins the criteria to the opening filter**, so the dashboard's list and the
  game view's Newer / Older / Next unreviewed walk exactly the same slice in the same order. The
  game view takes the filters from the query string it was linked with.
- **`matchesCriteria` in `lib/game-filters.ts` is the single scope rule** — site, colour, time
  control, date window, rating band, the phase a game ended in, whether you have reviewed it and
  which tag that review carries. Date windows carry months *or* days, so "1 week" is seven days
  back rather than a fraction of a month.
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
  Refresh button and the `fresh` option force a server read. The cache is built with
  `cacheSizeBytes: CACHE_SIZE_UNLIMITED`, which turns the LRU collector off outright: every
  eviction is a billed read later, the whole collection is a few hundred small documents, and the
  SDK never starts its `Collect garbage` scheduler when the threshold is -1, so a tab that is not
  primary has one fewer background job to fail at.
- **One Firestore log line is filtered out, and it is the only one.**
  `Failed to obtain primary lease for action 'Backfill Indexes'` is noise the SDK makes and then
  handles itself. The index backfiller wakes on a timer in every tab and opens a
  `readwrite-primary` transaction; with `persistentMultipleTabManager` exactly one tab holds that
  lease, so elsewhere `IndexedDbPersistence.runTransaction` writes the line straight to
  `console.error` and throws a FAILED_PRECONDITION its own scheduler catches and ignores. Nothing
  is lost — the primary tab does the work — and this app configures no persistent cache indexes,
  so there is nothing to backfill at all. Normally the scheduler is stopped as soon as a tab stops
  being primary, and the line escapes only between losing the lease and that stop landing, which
  is why it appears sporadically rather than every minute. Nothing can turn it off: the backfiller
  opens the transaction before checking whether an index exists, `onLog` adds a handler *alongside*
  the console one instead of replacing it, and `setLogLevel('silent')` would take every real error
  with it. So `silenceLeaseHandoverNoise` in `lib/firebase.ts` drops that sentence when it carries
  the `@firebase/firestore` tag, and passes everything else through — a backend that cannot be
  reached, a rules rejection, an app error of our own. Left in, it is also what inflates the Next
  dev overlay's issue count while the app sits open. `CACHE_SIZE_UNLIMITED` already removes the
  `Collect garbage` half by never starting that scheduler.
- **A failed read shows itself instead of spinning.** Every page load went through a bare
  `.then`, so a Firestore failure — the daily quota, a dropped connection, rules — left the page
  on its spinner forever with nothing but an unhandled rejection in the console. Each page now
  catches, renders `LoadError` with a Try again, and clears the error inside the promise callback
  rather than synchronously in the effect, which would cascade renders.
- **An uploaded game is a game, and is not your record.** A pasted PGN becomes an ordinary
  document with `source: 'upload'`, so the board, the engine, the review, the drill and the
  patterns all work on it without knowing where it came from — and `matchesCriteria` drops it
  from every slice unless the Site filter asks for `upload` by name, because a game you brought
  in to study would otherwise be answering a different question inside your win rate. Its id is
  an FNV-1a hash of the moves and the players, so re-uploading the same game merges onto the same
  document and a review written on it survives. `Source` splits into `ProviderSource` for this:
  syncing only ever speaks about the two sites, and an upload has no endpoint to fetch from.
- **One depth or the number means nothing.** Centipawn loss and the think-time bands only count
  games analysed at `ENGINE_DEPTH`. A shallower engine finds fewer mistakes and scores them
  smaller, so mixing depths would have shown a step change at the moment the depth settled at 21
  and older games kept their 12 — an improvement that was really a tooling change. `isComparable`
  is the one rule, and both readings say how many games they are built from.
- **Below ten analysed games there is no trend, rather than a small one.** The accuracy figure
  compares the last `TREND_WINDOW` games against the ones before, and two windows of one game
  each would report "higher than the run before it" about a single bad evening. `MIN_TREND_WINDOW`
  refuses that: under ten analysed games it shows the plain average and says what a comparison
  would need.
- **Accuracy measures inside a ±1000 window, not the stored `cpLoss`.** Evaluations run to
  `MATE_SCORE` (10000), so one move walking into a forced mate scores a loss near 9,800 — in a
  44-move game that is 223 added to the average by that move alone. It showed: a real nine-game
  slice read 126 when the honest figure was a fraction of it, and on the fixture that reproduces
  it, two mates in nine games move the average from 84.6 to 39.1. `cappedLoss` squeezes both ends
  into ±1000 first, which is what lichess does, and it brings a second thing the app already
  believes: a slip made when you were already lost comes out at zero, because both ends pin to the
  same wall — the rule `classifyMove` follows when it refuses to mark a blunder in a lost
  position. It is derived on read from the stored `cpBefore`/`cpAfter`, so nothing needs
  re-analysing. Per-move losses are also floored at zero: a move the engine likes more afterwards
  is not credit against a blunder elsewhere.
- **The long end of think time is three bands, not one.** In a slow control most moves land past
  a minute, and a single "over 60s" bucket held more of the game than every other band together —
  which says nothing about when things go wrong. It splits at 180 and 300 seconds, and the labels
  turn into minutes there, because "1–3m" is read at a glance where "60–180s" has to be converted
  first. Each band owns its lower bound and not its upper, so there is no second where a move
  belongs to two.
- **Think time is a comparison with yourself, and says so.** A hard position takes longer *and*
  goes wrong more often, so the bands cannot prove that thinking fast causes mistakes. The panel
  states that where the numbers are, rather than letting the bar chart imply otherwise.
- **The think-time figures are rates within a band, and the panel has to say so.** "Share of your
  moves in each band that the engine marks" was read, reasonably, as the share of mistakes falling
  in each band — which would add to 100, and these do not. Each band is measured against its own
  total. The bars are drawn against the worst band rather than against 100%, because at a true
  0–100% scale five rates of 2–9% are invisible slivers; the panel now names the band it is
  scaled to instead of leaving the bars to imply a scale they do not have.
- **Stats are never stored.** `computeSplit` runs over the loaded games on every render.
- **Opening matching is position-based**: `positionKey` is FEN fields 1–3 (placement, side to move,
  castling) after the opening's last move, and a game matches if it ever reaches that key within
  `MAX_OPENING_PLY` (60) half-moves. That makes transpositions count.
- **The variation tree is derived, never stored.** `buildOpeningTree` nests a saved line under the
  deepest other saved line that is a move-prefix of it, so 1.e4 c6 2.d4 d5 3.e5 files itself under
  1.e4 c6. Editing or deleting a line re-parents everything automatically.
- **Colour is part of a repertoire's identity.** The same opening saved once as White and once as
  Black is two separate trees, and `canNest` keeps a line out of a parent saved for the other
  colour — the Panov Attack saved as White will not land under a Caro-Kann saved as Black. A
  colour-agnostic parent adopts either side; a colour-specific parent never adopts an agnostic
  child, which would widen it. `openingLabel` appends "(as White)" / "(as Black)" so the two are
  distinguishable in the dropdown, breadcrumb and tables.
- **`next.config.ts` pins `@opentelemetry/api` to its CommonJS build.** firebase-admin pulls it in
  transitively and its ESM entry has extensionless relative imports the bundler cannot resolve;
  Next's own tracer imports it, so `serverExternalPackages` alone does not help. Removing the
  `turbopack.resolveAlias` floods the dev console with module-not-found errors.
- **The admin credential is format-agnostic.** `FIREBASE_ADMIN_CREDENTIALS` holds either a service
  account key or the `authorized_user` JSON from `gcloud auth application-default login`;
  `readCredential` picks `cert()` or `refreshToken()` off the `type` field. The second form exists
  because org policy can forbid service account keys outright.
- **The two providers disagree about which rating they report, and lichess is normalised at the
  door.** chess.com's archive carries the rating *after* the game; lichess reports the rating going
  *in* plus a `ratingDiff`. The provider stored lichess's raw `rating` and never read the diff, so
  every lichess rating was one game behind — a win you had just played did not show, and a figure
  could *fall* after a win, because it was reading the rating before the game that followed the
  loss before it. That is how it was found: a week's lichess classical figure went down after the
  only classical game of the week was won. `ratingAfter` in `lib/providers/lichess.ts` adds the
  diff once, at the edge, so everything downstream can keep assuming post-game rather than each
  reader knowing where the game came from. **Lichess games synced before this carry the pre-game
  number and cannot be repaired at read time — the diff was never stored — so they need a
  re-sync**, the same as the clock alignment fix.
- **Stored ratings are POST-game, on both providers.** `userRating` / `opponentRating` already
  include the result of that very game, so bucketing by rating difference sorts wins into
  "weaker opponent" and losses into "stronger opponent" by construction — it produced a completely
  inverted result before this was caught. `withRatingsBefore` in `lib/ratings.ts` rebuilds the
  pre-game numbers: yours is the previous game's post rating in the same pool, the opponent's is
  theirs with this game's move undone by the pool's median step. Pools are keyed by
  `source + timeClass`, since a site keeps one rating per class, not per clock. It is derived at
  read time rather than stored, because syncs arrive newest-first and a game's predecessor often
  lands in a later sync.
- **One token check for every route, and it is the only one.** `lib/api-auth.ts` holds it:
  `requireUser` for a signed-in caller, `requireAdmin` for the deployment's owner, sharing one
  verified-token cache. A second copy would be a second place to be subtly wrong, and would not
  share the cache — which is what makes it affordable, since a game's analysis is eighty requests
  carrying the same token. It checks tokens against Google's `accounts:lookup` rather than
  firebase-admin, for the loading reason documented under `/api/engine`.
- **Server-side analysis is for the owner, not for anyone signed in.** `/api/engine` is the one
  endpoint that burns real CPU per request — a game is eighty positions at depth 21 — so every
  account that can reach it can spend the deployment's compute, and signing in is free. `ADMIN_IDS`
  is a comma-separated list of uids, read on the server only: deliberately not `NEXT_PUBLIC_`, so
  the browser bundle never carries it and the client is never the thing deciding. Empty means
  nobody, and the route refuses rather than opening up. Everyone else still has the engine — it
  runs in their own browser, which is the default anyway.
- **The export authenticates as you and returns your data.** It was a shared `EXPORT_API_KEY` plus
  an `EXPORT_UID` naming whose data to hand over: two things to configure, one secret that could
  leak everything, and a design that could only ever serve one person. Now it takes the Firebase ID
  token the browser already holds and reads the tree belonging to that uid. It still needs the
  Admin SDK, because the route runs outside any session and Firestore rules scope every document
  to its owner — the uid from the token is what makes using it safe.
- **One `Panel` shape, and it is the only one.** The dashboard grew a section at a time and
  ended up with three heading styles, two paddings and four of its nine panels in no box at all —
  each defensible alone and incoherent together. `Panel` in `components/Section.tsx` owns the box,
  the heading, the fold control and the body, so a new panel cannot invent a fourth style. `meta`
  is the figure belonging to the panel as a whole and stays visible while it is folded, because
  that is usually the line you folded it down to; `actions` holds the controls that act on it.
  The two wide tables sit flush in the body with `-mx-5` rather than keeping their own border —
  a bordered box inside a bordered box reads as a mistake.
- **Sync lives where you notice games are missing.** It was on the profile page, which
  meant leaving the dashboard, syncing and coming back — for the thing you do most often.
  It is now the first panel on the dashboard, folded, because it is a control you reach for
  rather than something to read; the line it folds down to is the one question you have
  about it, which is when it last ran. It opens itself when there are no games at all,
  since then it is the only thing on the page worth doing. Pasting a PGN stays on the
  profile page: an upload is a game you brought in to study, not your record, and it is not
  something you do weekly.
- **The first sync is seeding and every later one is topping up.** They are different
  sizes of job, so the count defaults to the last 100 on an account that has never
  synced and the last 10 on one that has. Ten exists because it is what a routine sync
  actually needs — you open the dashboard after an evening's play and want the four
  games you just finished — and it is not only faster: `saveGames` rewrites every game
  it fetches, so asking for fifty is fifty document writes to bring in four, against the
  cost model the rest of the app is built around. The default is decided once, at mount,
  and after that it is an ordinary choice with the chips right there.
- **A sync that fetched nothing it already had says so.** That is what makes a small
  default safe. If every game fetched was new, the window never reached back to anything
  already stored, so there is no way to know it caught everything — whatever number was
  asked for. Without the warning, picking too small a number is something you discover
  weeks later as a hole in the data; with it, the sync tells you to run a larger one.
  The test is `added.length === fetched.length` rather than anything about the count,
  which is why it holds for 1000 as well as for 10.
- **Every dashboard panel folds, and stays folded.** The page is long and most visits are about
  one thing, so each panel carries the same `+`/`−` a review entry has. One difference decides the
  implementation: a review is a form you fill once, while the dashboard is a page you open daily,
  so the state outlives the visit. It lives in localStorage under one key, read through
  `useSyncExternalStore` with a server snapshot of the panel's own default — the same reasoning as
  the engine mode toggle, and the reason it is not a `useState` set from an effect, which would
  flash and trip `set-state-in-effect`. The key holds `id → folded` rather than a list of the
  folded ids: a list can only say "folded", so it could not express a panel that starts folded and
  has been opened, which is what Sync needs. The old array is converted on read, the same habit as
  every other stored shape here. `useFolded` is a hook and a button rather than a wrapper component
  because every panel already owns its box and heading; a wrapper would have had to duplicate
  those or strip them out of five files. A folded panel keeps its heading and whatever figure
  reads at a glance — the clock keeps "40 of 40 games have move times" — and drops the prose
  explaining a table that is no longer there. A panel with nothing in it, like the engine readings
  before anything is analysed, has no control at all: there is nothing to fold.
- **A plan day and a game meet on the date the game was *played*, and neither stores the other.**
  A day knows which date it is; a game knows when it was played. So the games that answer "play
  two rapid games" turn up under the day that asked for them — nothing to link, nothing to keep in
  step when a plan is edited, and no way for the two to disagree. Matching on when the *review*
  was written was wrong in a way that only shows in use: a game played on Monday evening and taken
  apart on Tuesday morning would file itself under Tuesday, away from the task it answers.
  Reviewing a game later does not move it; the day shows every game played and marks which have
  been reviewed. The same habit as the variation tree and the pre-game ratings.
- **The rating history is derived and then stored, which almost nothing else here is.** Every
  other figure is computed on read, but this one has to outlive the games it came from: the app
  holds the last N games you synced, so once older games age out, the only record that you were
  1550 in March is this. `closingRatings` takes the rating after the last game of each chess day
  per pool — the 6am rule again, so a session past midnight closes the day it started in — and
  `saveGames` rebuilds and merges it on every write, so no caller can forget. A rebuild only ever
  *adds*: merging from games that no longer include March must not erase March.
- **Stored per year, not per day.** A document per day would be a read per day on the dashboard,
  which is the cost model this whole app is built around avoiding; one document for all time would
  eventually meet Firestore's 1MB ceiling. A year is a few thousand small entries and one read.
- **Only days you played are written, and the rest carry forward.** A rating does not change on a
  day you did not play, so writing it again would be the same number on a thousand rows. `ratingOn`
  carries the last close forward, and `seriesInRange` puts a point on *every* day in the window
  rather than only the days with games — a gap drawn as a straight line between two distant games
  reads as volatility that never happened, where a flat stretch is the truth.
- **Three pools, named pairs, because a rating only means something against its own.** A site
  keeps one rating per time class, so `TRACKED_POOLS` holds `chesscom:rapid`, `chesscom:blitz` and
  `lichess:classical` rather than one number. Uploads and engine games are left out, as everywhere
  else.
- **A plan and each of its weeks are measured the same way, start against now.** The
  start is your close the day before the first day; the end stops at the stretch's own last
  day once that day is behind you, because a week that ran in March answers for March and
  not for everything played since. While it is still running the end is simply today. Both
  ends are read from the history rather than the clock — `ratingOn` carries the last close
  forward, so asking for today and asking for the history's own end give the same number,
  and using the history keeps `Date.now()` out of a render. `ratingWindow` picks the two
  days and `planRatingWindow` / `weekRatingWindow` are the two spans it is asked for; one
  table renders both, because a week answering the question differently from the plan above
  it is the kind of inconsistency you have to stop and work out. It also makes the weeks
  join up: a finished week's end is the close the next week reads as its start, so the
  plan's whole movement is the sum of theirs.
- **A week still ahead of you shows no rating at all.** Read from the history alone it would
  show today's number at both ends and a change of zero — true, and reading as a measurement
  of something that has not happened. The plan page already works out which week today falls
  in, so the card is given that rather than reaching for the clock itself.
- **A plan week reads its rating; it does not keep one.** It used to be stored on the week and
  filled by a button, which meant a figure that could be out of date and a button that had to be
  remembered — both unnecessary once the history exists. It also showed only the figure going in
  and what the *previous* week had done, so every week reported its neighbour's result.
- **One pool at a time, full height.** Three stacked strips of 48 pixels each was three charts
  too small to read, and stacking them invited the question of whether the heights compared, which
  they cannot — rapid at 1690 and blitz at 1244 share no scale. Chips switch pools, the chart gets
  the whole panel, and the axis labels and the figure in the header belong to whichever is showing.
- **The rating chart follows the date window and the site, and nothing else.** There is no such
  thing as your rating "in the Caro-Kann as Black", so the opening, colour and tag filters do not
  touch it. It ends on the last day the history knows rather than on today, which keeps `Date.now`
  out of render — the purity rule catches that — and is the honest end of the data.
- **A date range keeps its year when the ends differ.** Without it a three-year span renders as
  "7 Oct – 3 Oct", which reads as four days backwards; that is exactly what the rating panel
  showed. `formatRange` adds both years when they differ and stays short inside one year.
- **The numbers the analysis is a judgement about are set per account.** Every one of
  them — the level band, the winning cut, how few moves make a position sharp, the
  mistake and blunder thresholds, how many candidates to ask for — began as a constant in
  the file that used it, and every one of them moved at least once, each time as a code
  change for a matter of taste. They live on the user document now, in `lib/settings.ts`,
  and the screen that sets them is the screen that shows what they produce: the bands as
  they will fall, and the table of what every pair is called. Nothing is re-analysed when
  one changes, because the marks and the verdicts are derived as the games are read.
  `normalizeSettings` keeps the pairs in order — a level band wider than the winning one
  would make `better` an empty band.
- **The settings are a module value, set when the account's games are read.** Every pure
  function takes them as an argument defaulting to `settings()`, the same shape as the
  engine mode toggle. `getGames` awaits them before it normalises, because a mark derived
  from the defaults and then shown under your own bands would be two answers to one
  question. It costs one document read, shared with the profile.
- **The screen explains itself, or the screen is wrong.** Every field had a hint, every panel a
  paragraph, every tag group a gloss — each one reasonable alone and together an essay wrapped
  round a tool. The rule now: text earns its place only if it says something the control cannot,
  and cannot be moved into a label, a placeholder or a tooltip. So the review form is four
  questions and nothing else; the tag groups are their own names; `×5` is taught by the default
  value using it rather than by a sentence about it; and the two facts that genuinely stop a wrong
  reading — that a chess day runs 6am to 6am, and that think-time bands each have their own
  denominator — are tooltips on the headings they belong to. If something still seems to need a
  paragraph, that is a signal about the control, not a licence to write one.
- **A chess day runs 6am to 6am.** A game at one in the morning belongs to the evening it came
  out of, not to the day that has just started, so a late session counts against the day you sat
  down to play — which is the day the plan asked you to. `chessDayKey` files a game, and
  `todayPosition` uses the same boundary, so before six you are still on yesterday's day of the
  plan. It steps back a calendar day rather than subtracting six hours of milliseconds, for the
  same reason `dateAt` counts on the calendar. The plan's own dates are untouched: `dayKey` still
  answers which calendar day a plan day is.
- **A day's game rows carry no tags.** They ran to nine on one game, which squeezed the
  opponent's name out of the row and carried the review pill off the edge of the card — the tags
  belong to the game view, where there is room to read them. The row says result, who, class and
  whether it has been reviewed, and the class rather than the control because "blitz" lands where
  "180+2" has to be decoded.
- **Plan days are counted on the calendar, not in milliseconds.** `startDate + index * DAY_MS` is
  wrong twice a year: a day is 23 or 25 hours across a clock change, so adding fixed milliseconds
  lands an hour short and every later day reads as the one before it at 23:00. A plan running
  through 5 April 2026 showed two day fours and no day five. `dayDate` uses
  `new Date(y, m, d + index)`, which normalises month ends, year ends and clock changes alike, and
  `todayIndex` compares day keys for the same reason. The test finds the timezone's own boundaries
  at runtime rather than hardcoding a date, because a fixed-offset machine passes a broken
  implementation without noticing.
- **Dates in a plan are spelled out, never `toLocaleDateString`.** The locale version renders
  `04/10/2026` on the server and `10/4/2026` in the browser, which React reports as a hydration
  mismatch; `formatDay` writes "Mon 28 Sep" the same way everywhere, and spelling the month also
  removes the question of which number is which. (`GameRow` still uses the locale version and is
  the one place left that could trip on this — it only renders after a client-side read, so the
  server never emits those rows.)
- **A plan is weeks of days, and the weeks are the unit you work in.** One plan covers months —
  "ChessGoals Yusupov Intermediate" is a dozen weeks — so a flat list of days is a page you scroll
  past rather than read. Weeks fold, the one holding today opens on arrival, and `+ Add a week`
  copies whatever the last week asks for. Dates are still counted straight through: day one is
  `startDate` and `dayOffset` walks the weeks before it, so nothing stores a date and no two days
  can disagree about which one they are.
- **A task is a count, not a tick.** Most of what a plan asks for comes in quantities — five
  puzzles, two rapid games — and three of five is neither done nor not done. `target: 1` is an
  ordinary checkbox and is what a task without a count becomes, so the common case keeps its
  single click and the stepper only appears where there is something to step. The box completes
  or clears the whole task; the stepper moves one at a time. Progress counts the *things*, so a
  day of "5 puzzles" and "1 game" reads 3/6 — counting lines instead would leave a day looking
  untouched until a whole task was finished. A template line ending `×5` sets the count, which is
  why the count has to be at the end: "play 2 rapid 15+10 games" keeps its numbers.
- **Every plan edit is a function of the current value, at every level.** The page, the week, the
  day and the task all take an updater rather than a finished object. This was got wrong twice and
  each time the symptom was the same: handlers in one React batch all read from the same rendered
  snapshot, so the last won. Three quick ticks landed as one, and after that was fixed at the day
  level, three clicks on a `+` still moved a count from 0 to 1 because the row was computing
  `task.done + 1` from its own stale prop. The page's own `save` is now a plain
  `setPlan(current => update(current))`: React applies queued updaters in order against the latest
  state, which is the composition it needs. It used to carry a ref holding the newest plan, and the
  only thing that ever needed the new value *synchronously* was the Firestore write on every edit —
  so when that went, the ref went with it. Checked on the real cards: three clicks dispatched in one
  synchronous burst move a count from 0 to 3.
- **Plans come from the server, and they are the one collection that does.** Everything
  else here is cache-first because Firestore bills per document and the games collection
  is a thousand of them. A plan is the opposite on both counts: there are one or two, and
  it is the thing you tick off on a phone during the day and open on a laptop in the
  evening. Cache-first meant the laptop showed what the laptop last saw — four blitz games
  ticked off on the phone, an empty day on the desktop — because a write from another
  device never reaches this one's cache, and the plan page has no Refresh button to force
  one. Two billed reads a visit is the right price for a page that is wrong without them.
  `getPlans` defaults `fresh` rather than leaving it to callers, so it cannot be forgotten
  at a new call site.
- **A draft only outranks the server until the server moves past it.** The device's
  unsaved work is newer than Firestore by definition — it exists *because* it was not
  saved — which is why it is restored rather than offered. That stops being true the
  moment another device saves: then the draft is not newer work, it is work already moved
  past, and restoring it would quietly undo whatever the phone did. `updatedAt` is stamped
  by `updatePlan` itself, not carried in `planBody`, so a save can neither forget it nor
  round-trip a stale one — and the comparison is `draft.editedAt < plan.updatedAt`. A plan
  written before the field existed has none and falls back to the draft winning, which is
  the safer way to be wrong: a visible banner offering Discard beats silently dropping
  work nobody can get back.
- **A plan is saved by a button, and what is unsaved lives on the device.** Every edit used to
  write the whole document, which lost data in two ways at once. A write *replaces* the document
  and several in flight are not ordered, so an earlier snapshot could land last and undo the three
  edits after it. And on a phone, switching app suspends the tab: anything not yet sent existed
  only in React state, so coming back showed whatever had reached the server. Both were reported
  as "my changes revert". Now an edit changes the screen and an effect writes the whole plan into
  localStorage under `plan-draft:{uid}:{planId}`; Save is one `updatePlan` for everything since
  the last press, and clears the draft. A draft found on load outranks Firestore — it exists only
  because edits were made and not saved — so it is restored rather than offered, with a line
  saying when it was written and a Discard beside Save for the case where it is not wanted.
  `beforeunload` warns on closing the tab, which is a courtesy and not the safety net: the draft
  survives that too, which is why there is no matching guard on the in-app links.
- **The day's note is written on every keystroke, not debounced.** It used to sit in the
  textarea's own state for 800ms before reaching the plan, which was the right trade when a change
  went straight to Firestore and is the wrong one now that it goes to a draft on the device: a
  debounce is a window in which the last thing you typed exists nowhere that survives the tab
  being suspended. Weeks fold, so only the open week's seven cards re-render, and a localStorage
  write of a small JSON document per keystroke is not something a keyboard can outrun.
- **A finished day or week folds on arrival, and never under your hand.** Whether one starts open
  is decided once, in a lazy `useState` initialiser; after that it is plain state. Deriving it
  every render would fold the card away as you ticked its last box, which is exactly how the
  review form's tag picker once closed itself when you picked the first tag.
- **A stored plan is normalised on read, not migrated.** Two shapes have existed: a flat `days`
  array of ticked tasks, and weeks of days whose tasks are counted. `normalizePlan` converts the
  first into the second on the way out of Firestore — one week holding the old days, `done: true`
  becoming one of one — and since `updatePlan` replaces the document, a plan rewrites itself the
  first time you touch it. Same habit as `betterMovesOf` and the pre-game ratings.
- **The deployed commit is on screen, signed in or not.** `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` is
  inlined into the browser bundle at build time, so `lib/version.ts` is a literal in the shipped
  JavaScript rather than a lookup and cannot drift from the code around it. It reads
  `production · df3cda7`, and `local · dev` when there is no deployment to name — which is the
  honest answer rather than a fake build number. It sits on the sign-in screen too, so a deploy
  can be checked without an account.
- **The home page scrolls and lays out in two columns.** It used to centre six cards in an
  `h-screen` box, which clipped the last one on a short window with no way to reach it, and the
  Sign out control sat inline against the title with nothing holding it off. It is now a bordered
  button with its own space, the page scrolls, and the cards go two across from `sm` up.
- **Dashboard filters live in the query string** (`readFilters` / `writeFilters`), seeded from
  `useSearchParams` and mirrored with `history.replaceState` so chip clicks stay instant and the
  back button is not flooded.
- **A variation's games include its sub-variations** (`gameMatchesNode` unions the subtree), so a
  parent's totals always cover its children even when a game transposed straight into a child.

## Analysing the games
`.claude/skills/game-analysis` answers questions about the stored games, and its one rule
is that it never runs the engine. The app has already paid for the evaluations and the
second pass; a question about them is a file read. `scripts/pull.mjs` copies the user's
documents into a gitignored snapshot, `scripts/slice.ts` reads them the way `getGames`
does — settings in force, marks re-derived — and a report says its coverage, because a
breadth or a `holds` is only known for the marked moves someone has actually read. When
the data is missing the gap is the finding: the first pass is a button on a game's page
and the second is *Read N more* on the dashboard, and both are the user's to run.

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
- The phase and variation tables scroll sideways on a phone rather than reflowing — they are
  wide by nature, and both sit in an `overflow-x-auto` with a visible scrollbar. Nothing else
  needs horizontal scrolling at 375px; the board and the move list stack.
- Lichess arena *berserk* games halve the starting clock while still reporting the full
  `clock.initial`, so the first move's time is overstated for them. Nothing else is affected.
- `clocks` is null on games synced before clock capture existed; a re-sync backfills them.
- Lichess games synced before `ratingAfter` existed carry the rating from *before* the game.
  A re-sync fixes them; nothing can at read time, because the rating change was never stored.

## Not built yet
- Transpositions *between* named openings (a line only nests by literal move prefix)
- Background or scheduled syncing
- Any training drill built from the tag counts — the database is read by eye for now

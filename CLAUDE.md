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
   descriptor is read from. So does **your tag vocabulary** — the words the Mistake
   database counts, in groups you name, where renaming one renames it on every review
   already carrying it and removing one takes it off them.
3. `/openings` — paste an opening line, name it, optionally tie it to a colour; a line that
   continues an existing one nests under it as a sub-variation. Saved lines can be edited.
   Each one opens as a **study** at `/openings/{id}`: what the opening is for, the plans on
   both sides, and then three things read off what is already on disk — the sub-variations
   under it, your games that reached it, and the patterns naming it. Under those, the
   lichess studies where the lines are worked out, each playable on a board in the page,
   and the references it came from. Writing is behind an Edit switch, saved by a button,
   and what is unsaved is kept on the device.
4. `/dashboard` — results, openings, clock and rating; what went wrong moved to
   `/mistakes`, which the page links to carrying the slice. Sync games sits at the top, folded, so bringing in new games does not
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
5. `/mistakes` — what went wrong, under the same filters the games dashboard uses plus
   six of its own: which mark a move carried, which piece moved, which phase of the game
   it was played in, how long you thought before playing it, which band you were standing
   in when you did, and what the position asked for. A heatmap shows
   where on the board they land, and a square on it is a filter — press h4 to read only
   the mistakes that landed there. Under it, the engine's readings, the second pass's
   verdicts, the Mistake database and then every marked move as a row carrying what the
   second pass made of it, each linking to its game.
6. `/games/{id}` — one game: the eval graph and what kind of game it was, folded away at the
   top; a board you can step through, the engine's marks on the move list,
   and your own root-cause analysis of the one to three moves that decided it. A second
   pass over the marked moves says what *kind* of mistake each was — a line missed, a
   won game thrown, an edge mishandled — and any reading can be thrown out. Reached from any
   row in the dashboard's game list, which carries the filters along so Back returns to the same
   slice and Next walks it. The Mistake database panel on the dashboard adds up the tags those
   reviews carry; clicking a tag filters the games down to it.
7. `/patterns` — write up the ideas themselves, found rather than scrolled: a search box
   over names, motifs and conditions, and chips for the kind, whether the essentials are
   answered, and the motif. One write-up is a name, a kind (tactics, mate, strategy,
   development, endgame), the conditions that bring it about and the examples showing it
   — and any of them can be taken apart against the *Pattern Internalisation Essentials*
   method: what each piece is responsible for, what weakness lets the tactic exist, what
   would break it and what it survives. A tactical one can also say which tactic it is.
   An example is a game opened on the move where the idea appears, *or* a position pasted
   as a FEN with the moves played on top of it, for the tactic you have without the game
   it came from. Any move of a line can carry its own comment, and they are listed beside
   the board to read or to jump to. The name becomes a tag in the review form, so a
   mistake can point at the idea you should have played, and its own page lists the games
   where you wanted it. The boundaries you write under 3a and 3b become a **drill**
   at `/patterns/drill`: a change is put in front of you and you say whether the pattern
   still works, scheduled so the ones you get wrong come back soonest.
8. `/plans` — a stretch of deliberate practice written down: a name, a start date, and weeks
   of days carrying the same tasks, editable from there. Count things off — three of five
   puzzles — write a note on the day, and see the games you played that day beside it.
   The plan says what it has been worth — your rating going in against where it stands
   now — and every week says the same over its own seven days, read from the rating
   history with nothing to press. Weeks fold, and more can be added as the plan runs on.
   Editing is local until you press Save, and what you have not saved is kept on the
   device, so closing the tab or switching app does not cost you it.
9. `/guides` — a coach's sheet of positions written up. A guide is a name, a line
   saying what the set trains, and the exercises themselves; an exercise is a diagram
   pasted in as a FEN and the board you solve it on, with variations, a comment on any
   move and a note on the whole thing. Tick one off when you have it, and the sheet says
   how far through you are.
10. `/learn` — the positions from those reviews put back in front of you, one at a time, with the
   answer withheld until you have tried. Drill `from my reviews` or `from every flagged mistake`,
   under the same dashboard filters, and read what is sticking by tag. Find the move you
   wrote down and the drill plays their reply and asks what you do about it, down the
   whole line you recorded. A third source is `from my solved exercises`: the positions
   off your coach's sheets, once you have ticked them Solved, with what you wrote about
   each move shown only after you have answered.

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
│   ├── openings/[id]/page.tsx  # One opening as a study: ideas, variants, games, links
│   ├── dashboard/page.tsx      # Stats + opening filter + game list
│   ├── mistakes/page.tsx       # Every marked move, the heatmap, the tag table
│   ├── games/[id]/page.tsx     # One game: board, moves, your own review
│   ├── patterns/page.tsx       # Thematic patterns: list + create
│   ├── patterns/drill/page.tsx # Does the pattern still work here?
│   ├── guides/page.tsx         # Exercise guides: list + create
│   ├── guides/[id]/page.tsx    # One sheet: the positions, solved on a board
│   ├── patterns/[id]/page.tsx  # One write-up: the method or the conditions, lines, games
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
│                               # MoveTreeBoard, MoveNoteCard, ProposedMoves, TagPicker,
│                               # PatternStudy, ExerciseCard, FilterPanel, MistakeHeatmap,
│                               # EnginePanel, EngineMode, PatternForm, TagGroupsPanel,
│                               # StudyIdeaList, StudyIdeaRow, StudyLinks,
│                               # UploadPanel, AccuracyPanel, StatusTag, Section,
│                               # PlanDayCard, PlanWeekCard, PlanForm, PlanRatings,
│                               # AnalysisSettingsPanel, VerdictPanel, ShapePanel, EvalGraph,
│                               # GameShapePanel, ClockPanel, ThinkPanel, ConfigNotice,
│                               # HomeNav, RatingPanel, SignInButton
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
│   ├── study.ts                # an opening written up: the sections table, ideas, links
│   ├── movetree.ts             # the branch model: one tree behind every board
│   ├── game-tree.ts            # a game's played moves, variations and proposals as one tree
│   ├── draft.ts                # anything edited and not yet saved, kept on the device
│   ├── pattern.ts              # thematic patterns: kinds, PGN parsing, tag plumbing
│   ├── pattern-drill.ts        # the boundary drill: cards off 3a/3b, and when they come back
│   ├── mistakes.ts             # marked moves as rows: the square, the piece, the heatmap
│   ├── exercise.ts             # a coach's sheet: guides, exercises, how far through
│   ├── use-line-editor.ts      # editing a line on a board, cursor held as moves
│   ├── tags.ts                 # your own tag vocabulary: groups, stable ids, display names
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
- **The mark is on the square the move landed on, not only in the list.** The move list
  has always carried the `?` and `??`, and reading them there means looking away from the
  board to find out that the move you are staring at is the mistake. On the square it is
  the same fact where you are already looking: a filled circle in the corner of the
  destination, red for a blunder and amber for a mistake, the way a chess site marks one.

  It is drawn in the square's own `viewBox`, like the piece sprites, so it scales exactly
  with the board at every width rather than needing a font size per breakpoint.

  **It straddles the corner, and at the board's edge it moves to the opposite one.**
  Straddling is how a chess site draws one and reads better than a circle tucked inside the
  square — but the board clips its own overflow for its rounded corners, so a badge on the
  top row or the right-hand column came out with a slice missing.

  Two wrong fixes came first, and the second is the instructive one. Flush everywhere
  traded the look on fifty-odd squares to rescue fourteen. Flush on the edge squares alone
  kept it where it mattered, and still left those fourteen looking *different* — a circle
  jammed against the piece rather than hanging off the corner, which reads as a rendering
  fault on exactly the squares where you most want to trust what you are seeing.

  Moving it is the answer: the same marker, same size, just in whichever corner has board
  left to hang over. `rows` is already in the order it is drawn, so the first eight entries
  are the top row and every eighth is the right-hand column whichever way the board is
  turned — which is all the badge needs to know. Each axis flips on its own, so a square at
  the top keeps its horizontal overhang and one at the right keeps its vertical.

  **Hanging over a neighbour also means winning against it, which takes a `z-index`.** Every
  square is `relative` with none, so all sixty-four sit in one painting layer and the part
  of the badge outside its own square lost to the square it hung over — the circle rendered
  with a flat slice off the top, and `overflow: visible` had nothing to do with it. The
  layout was always right: the overhang measured 7px outside the square while it was still
  invisible. Hiding the neighbour brought the missing arc straight back, which is what
  named the cause. `z-10` on the one square carrying a badge clears it over all of them in
  every direction, and nothing else on the board sets a z-index for it to fight with.

  The colours sit beside `MARK_COLOR` in `lib/review.ts` rather than in the board, for
  the reason that map exists at all: the marks are a severity scale and a scale only
  works if it means the same thing everywhere. `markBadge` is a step stronger than the
  written ink because it sits on a light board square rather than a dark panel, and it
  carries its own ink colour, since white on amber cannot be read.

  **It covers the whole scale, not just the two marks usually shown.** `marks` on the
  account decides what counts as a fault and defaults to `?` and `??`; turn inaccuracies
  on and `?!` starts reaching the move list, and would reach the board. A mark with no
  badge would draw nothing at all, which reads as the board having failed rather than as
  a setting being on.

  It shows only on the game as played. `cursor` is -1 off the game's own line, so a move
  you played out in a variation carries nothing — which is right, because it was never
  analysed. Checked on the real thing: standing on the variation that *replaces* a
  blunder, at the same ply, draws no badge.

- **What went wrong is its own dashboard.** The games dashboard answers "how did these
  go" — results, openings, clock, rating — and had three panels answering a different
  question bolted underneath it: the engine's readings, the second pass's verdicts and the
  Mistake database. Those moved to `/mistakes`, which asks only that question and can
  therefore ask it properly: every marked move as a row, with the game it happened in, and
  two filters the games dashboard has no use for.

  It **shares the filter panel rather than copying it**. `FilterPanel` was two hundred and
  sixty lines inside the dashboard, which was fine while there was one; a second copy would
  be a second place for "1 week" to stop meaning seven days. Both pages read and write the
  same query string, so the link between them carries the slice — arriving with the filters
  cleared would mean setting them twice. The panel takes an `extra` slot for the rows one
  page adds, because "narrow what I am looking at" should be one box wherever you are.

- **The square a mistake landed on and the piece that moved are read off the notation.**
  A SAN already carries both — `Nxd4` is a knight to d4 — and castling is the only case
  needing the colour to say which square the king reached. Replaying every analysed game
  to learn the same two things took **1.9 seconds against 2 milliseconds** for the parse,
  which is the difference between a page that re-filters as you press a chip and one that
  does not. It is checked against a real `chess.js` replay on all 1485 marked moves in the
  data: the square agreed on every one, and so did the piece.

  Nothing new is stored. This is the same habit as `materialByPly` — the answer was
  already in `game.moves` and `analysis.moves`, and the only question was how cheaply it
  could be got out.

- **The heatmap draws the squares the moves were played on, and e5 is e5.** It had a
  `from my side` view that mirrored a Black game's ranks onto White's, so that a weakness
  in front of your own king read on one rank instead of two: rank 2 as White and rank 7 as
  Black are the same square relative to you.

  The argument was about *relative* geometry and the board it was drawn on carried
  *absolute* labels, and that contradiction made it lie. The square printed `e5` held
  White's e5 mistakes **and** Black's e4 ones, and e4 and e5 are not the same square to
  anybody — 1.e4 e5 puts two different pawns on them. The top of the ranking read `e5 —
  77` about two squares at once, where the honest reading is e5 with 70 and e4 with 51.

  A relative board can be built; it just cannot be labelled with square names. It would
  need its own coordinates — "my second rank" — which is a second system to learn for a
  question the **Colour** chips already answer: narrow to one colour and rank 7 is rank 7.
  So the mirror is gone rather than relabelled.

  It is a board-shaped chart rather than the `Board` component: there are no pieces to
  place and no moves to make, and teaching the real board about arbitrary square tinting
  would complicate the thing five screens depend on for the sake of one that is not really
  a board. Shaded against the **worst square** rather than the total, the think-time bars'
  rule — sixty-four squares split as shares would all be slivers.

  **Nothing in it is explained in a sentence.** It carried two paragraphs — what the
  mirror did, and what the shading was measured against — on a panel whose whole content
  is a picture. The counts are drawn on the squares, the ranking is beside them with the
  worst square's bar running full, and the share of all mistakes is a column rather than a
  clause. That is the rule the rest of the app already follows: if a control needs a
  paragraph, the paragraph is a signal about the control.

- **Every square is the filter for itself, and the board therefore does not apply it.**
  The habit a variation row and a phase count already follow — the figure you are reading
  is the slice you want next — and here it is the whole reason the chart is a board rather
  than a list: "all my mistakes on h4" is a question you ask by pointing.

  The subtlety is that a picker cannot apply its own choice. `exceptSquares` strips the
  square filter and nothing else, so the board draws every square it would have drawn
  while the list below shows only the chosen ones. Without it, pressing e5 would leave a
  board with e5 on it and no way to choose a second square or to see where else things
  land. Every *other* filter still narrows it, which is what makes it worth pointing at:
  the board becomes 226 queen moves over 55 squares, and picking from that is a different
  and better question than picking from all sixty-four.

  Squares are a list rather than one, because "h4 or e5" is a real question and the board
  is a surface you can press twice. The filter panel grows a **Square** row only once
  something is picked — sixty-four chips would be a board drawn badly, and the board is
  already upstairs doing that job — so the row is the record of what was chosen, in the one
  place everything else active is listed. Those chips count against what the *board* was
  showing rather than against the whole slice, because that is the number the press
  produced: with the queen filter on, h4 reads 9 and not 43.

- **Where you stood is a filter, and it is the one the analysis kept asking for.** The
  verdict is *named* after the band you fell from — `threw it` and `missed the follow-up`
  are the same fall from two different places — and it was the one axis of that naming the
  page could not narrow by. "Every mistake I made while winning" meant leaving the app and
  writing a script.

  It costs nothing to know. `cpBefore` is stored on **every** move the first pass
  evaluated, not only the marked ones, so `standingOf` gives both the numerator and a real
  denominator: a chip can say *326 of 5,984 moves played from winning are marked* rather
  than only how many of your mistakes happened there. That is the same bargain the piece
  and phase rows make, and unlike the verdict column beside it the coverage is 100% — no
  second pass required.

  **A band's share is partly its own geometry, and the row says so.** The mark is defined
  as falling *out* of the band you were in, so a narrow band marks more than a wide one
  whoever is playing, and `winning` and `losing` have no ceiling or floor to fall through
  at all — which is why `losing` reads a true and useless 0 of 3,702 and keeps its chip
  anyway. That is the one thing the control cannot say for itself, so it is a tooltip on
  the heading, the rule the chess-day boundary already follows.

  `mate` is left out: a position past the mate score is one you are being mated in, and
  the grading refuses to mark a move there.

- **The row is the move, what it cost and how long you took — then the trivia.** It read
  move, square, *opponent*, evaluation: the opponent's name had the whole middle of the
  row and the two figures you actually scan for were a small grey afterthought at either
  end. Now the left is the question — the piece, the move, the square, the evaluation and
  the clock, the last two a size up — and who you were playing and when are small, muted
  and pushed right, where they do the one job they have, which is finding the game again.

  It is a flex row with fixed widths on that left cluster rather than a grid. The columns
  still line up, because each of those is a fixed width; what wants to disappear at a
  narrower window can then simply be hidden, instead of a second grid template that has to
  be kept in step with the first.

  **The pieces are the board's.** They were Unicode figurines — the trap the board itself
  hit and wrote down, where one font renders them as outlines and another as solid blocks
  — and at the size a row wants them they were a smudge. These are the same Cburnett
  symbols every board on the site draws, referenced by `<use>` off one sprite sheet
  rendered once in the panel, so they scale with no font size per breakpoint. They are
  drawn in **your** colour, which the text version could not say: a solid black pawn on a
  row about a game you played as White was quietly wrong about the position.

  The reading beside it dropped the `from →` half of its axes line, because where you
  stood is its own column now and printing `winning → level` there would be the same word
  twice on one row.

- **What the position asked for is a filter, in the app's own word for it.** The breadth
  separates a line you had to find from a position that forgave anything, and it decides
  which column of the transition table a verdict is named from — so it is the other half of
  **Where you stood**, and the pair is what makes "I was winning and *anything* would have
  done" a slice rather than an anecdote. It is 132 moves.

  `sharp` / `tight` / `stable`, from `breadthOf`, and not the raw count of holds. Counts
  were tried and are worse: they look precise and are not, because what counts as few is a
  setting (`narrow`), and `5 of 5` and `3 of 3` are the same thing said twice. The names
  are what every other screen already calls it.

  It is the one row with **no denominator**, and that is not an oversight: a move nobody
  marked has no candidate count, so there is nothing to be a share *of*. The coverage sits
  beside the chips instead — `1177 of 1641 read` — and a move the second pass has not
  reached is dropped by the filter rather than guessed at, the rule a think filter follows
  for a game with no clocks.

- **The filter is one table, not a pile of buttons.** Ten tidy label-and-control rows in a
  grid, then seven more underneath in their own `flex` stack with their own labels lining
  up with nothing: that is how a panel ends up reading as a heap. `FilterRow` and
  `FilterGroup` are exported from `FilterPanel` so a page's own rows are rows of the *same*
  grid, and the `extra` slot renders inside it rather than after it. Every row is a name on
  the left and a control on the right, every chip is the one `Chip`, and the label column is
  right-aligned so the names end where the controls begin.

  Two groups rather than seventeen rows: **which games** are in the slice, then **which
  moves** of those games you are reading. The split is real rather than decorative, and the
  heading is hidden when a page has only the first — a heading over the only group is a line
  that separates nothing.

  **One Reset.** The panel knew about its own filters and nothing about a page's extra ones,
  so the mistakes page had grown a second `Clear` beside it: two controls that both mean
  "stop narrowing". The page hands over how many of its own rows are active and what to do
  about them, and there is one button, which appears only once something is narrowed.

- **The fractions came off the chips, and were fixed on the way.** Every chip read
  `164/2946`, which is seven rows of digits to look past — and worse, it was measured
  against the whole slice, so with two filters on a chip went on claiming 506 after the
  list had narrowed to 122. Numbers describing a slice nobody is looking at are not a
  denominator, they are furniture.

  `except(filter, row)` generalises what `exceptSquares` did for one row, so a count is
  taken with the **other** rows in force and not its own — the patterns finder's rule, which
  this page had been breaking. The counts are still computed, because they decide which
  chips have nothing behind them and what the tooltip says, and a check asserts the promise
  is kept: with the queen filter on, the `??` chip counts 103 and pressing it delivers 103.
  They are simply not drawn. `moveTotals` stays as well — it is what the analysis scripts
  read, and it is where the 4.5%-against-14.3% reading came from.

- **A chip is already a pill, so the thing inside it must not be.** The **Where you stood**
  chips put `STANDING_BADGE` inside one: two borders around a word of 10px uppercase, and on
  an *active* chip — which is light — a translucent `bg-red-500/15` with `text-red-300` on
  top of it is very nearly invisible. `STANDING_INK` is the same scale as plain ink for
  exactly this, so the hue still matches the badge on the rows it filters to and there is one
  border instead of two. The badge itself is unchanged where it belongs, which is on a dark
  row.

- **The row says what the second pass made of the move, in the game view's own words.**
  The list was a move, a square, an opponent and a pair of evaluations — and `verdicts`
  already held, for 79% of those moves, the thing actually worth scanning for: the name of
  the fall, how many of the engine's candidates held, and what was on the board. Reading
  it meant opening the game.

  It is drawn from the same three inputs and with the same vocabulary as `EnginePanel`:
  `VERDICT_LABEL` for the descriptor, `STANDING_BADGE[standingOf(cpBefore)]` for its
  colour, and `holds/looked` beside it. A descriptor that read one way in a list and
  another on the game it came from would be two vocabularies for one judgement.

  `verdictsOf` is called once per game inside `mistakeRows` rather than per row — it maps
  over the handful of verdicts a game has and replays nothing, so this costs nothing like
  the material inventory would. A reading you have **dismissed** counts as no reading, so
  a rejected verdict cannot come back through a different screen.

  The coverage is in the panel's heading (`1641 · 1177 read`) for the reason the verdict
  panel states its own: a column that is blank on a fifth of the rows must say it is
  unread rather than letting that read as the second pass having found nothing.

  Below `sm` the row drops back to the four columns it had, because a descriptor truncated
  to two characters is noise where the move, the square and the evaluation are still the
  point — and a hidden grid item still costs its gap, so the track goes with it.

- **The list is most-recent-first, and that holds inside a game as well as between them.**
  It sorted games newest first and the moves within a game ascending, which is two sorts
  facing opposite ways: move 31 was played after move 12, so under one rule it comes
  first. The alternative — reading a game's mistakes forwards — is a different ordering
  principle, and a list that switches principle at a boundary you cannot see is a list you
  have to stop and work out.

- **When a mistake happened is asked in your own phases, not in buckets of ten.** The
  app already has a vocabulary for how far into a game something is — `GAME_PHASES`, the
  user's own named segments in the user's own move numbers, which the eval graph's
  dividers, the phase table and `decidedIn` all read. Inventing 1-10 / 11-20 / 21-30 here
  would have been a second set of move-number buckets disagreeing with the first, and
  "where do I go wrong in the opening" would have been asked about somebody else's idea
  of the opening. So the chips are the phases, labelled by their ranges with the name on
  hover, and moving a boundary in the settings re-files every row with nothing stored and
  no engine run — the same bargain every derived figure here makes.

  **Nothing had to be measured for it.** `moveNumber` on an analysed move is already a
  count of *your* own moves — ply 4 and ply 5 are both move 3 — which is exactly the
  quantity the phase ranges are in, so `phaseOfMove` is a lookup rather than a
  conversion. `gamePhases` is read once per `mistakeRows` call rather than per row,
  because it is the same six ranges for every one of sixteen hundred.

  It is the dashboard's `Ended in` vocabulary asked a different question, so the row is
  called **Played in**: that one asks how long the game lasted, this one asks when the
  move was played, and a move marked on move 23 of a game that ran to 60 belongs to the
  duel either way. They do not share a filter value — the phase chips are this page's own
  state, not the query string — so the two compose rather than colliding.

- **How long you thought is asked in the bands the think panel already uses.** The same
  argument as the phases one level up: `THINK_BANDS` in `lib/accuracy.ts` is the
  vocabulary the dashboard's think-time panel is drawn in — under 5s, 5-15s, 15-30s,
  30-60s, then 1-3m, 3-5m and over 5m, split three ways at the long end because in a slow
  control a single "over 60s" bucket holds more of the game than everything else put
  together. A second set of boundaries here would be a second answer to "was that a fast
  move". So the constant is exported and `thinkBandOf` is the lookup, and the two screens
  cannot drift.

  The bands are **absolute seconds and not a share of the clock**, which is the opposite
  of the choice `phaseEntry` makes. A phase entry has to be comparable across 3+2 and
  15+10 because it is read in one column; this is a filter sitting directly under the
  Control chips, so narrowing to one clock is a press away, and "under 5s" means the same
  thing to a player in both formats where "4% of the base" means nothing to anyone.

  **`thinkPerPly` is one function because getting a think time off a game is four steps
  with a trap in each** — clocks that may be absent, a daily control where per-move timing
  means nothing, a readings array that may be longer than the move list, and an increment
  already included in the reading. It was inline in `mistakesByThinkTime` and is now in
  `lib/clocks.ts`, read by both.

  **The depth guard belongs to the rate, not to the clock.** `mistakesByThinkTime` counts
  faults per move, so it drops games the current build has not analysed: a shallower
  engine finds fewer faults and would quietly lower one band's numerator. A think time is
  a clock measurement, and a shallow analysis does not make it wrong — so the rows here
  keep every marked move, and the comment in `mistakesByThinkTime` says which of the two
  it is.

  **A move nobody timed is dropped by the filter rather than counted as fast.** The
  question is how long you took and a game synced before clocks were captured has no
  answer; folding those in with the instant moves would be inventing one. How many that is
  is printed beside the chips, and the row says nothing when every marked move is timed —
  which is the case on this account.

  Every row also carries its own think, as a duration (`1m 28s`) rather than a clock,
  since the two are different quantities and the app writes them differently everywhere
  else.

  The think panel's standing caveat still governs how any of it is read: a hard position
  takes longer *and* goes wrong more often, so a slow band reading worse is not the clock's
  doing. What the rows below answer is the *size* of that, which is a different question
  from what causes it.

- **The mark filter offers what the account shows, and the piece filter is figurines.**
  `activeMarks` reads `marks` off the settings, so turning inaccuracies on puts `?!` in the
  row rather than leaving a filter that cannot match anything. Every chip carries the count
  it would give you, measured before this page's own filters are applied — otherwise every
  chip but the active one reads zero, which is the patterns finder's rule. They compose,
  so "where do I blunder my queen" is two presses: 1641 marked moves became 694 blunders
  became 94 queen blunders, and the heatmap followed each time. All four compose, which
  is what makes the rows worth having: 1641 marked moves, 58 of them played past move 50,
  18 of those a king move — and the heatmap of those eighteen is a different board.

- **A chip also carries what its count is out of, and without that every one of them
  misleads.** `506` marked moves played in under five seconds against `5` played after a
  think over five minutes reads as a damning fact about moving fast. It is very nearly a
  fact about how rarely anyone thinks for five minutes: those are 11,197 moves and 35
  moves. With the denominator it inverts — **4.5% against 14.3%** — and the ranking of
  every other row inverts with it. Pawns looked like the worst piece on the board at 391
  marked moves and are the second safest at 6.3%, because you move pawns more than
  anything; the bishop is the riskiest at 8.9%. The opening is not 10 mistakes' worth of
  safe, it is 0.4%.

  **It cost nothing to find, which is the point.** The first pass evaluates *every* one of
  your moves, not only the ones it ends up marking, so `analysis.moves` already holds the
  93% where nothing went wrong — the denominator was on disk the whole time. `moveTotals`
  is one pass over the same games the rows come from, bucketing by the same three keys.
  Same habit as `materialByPly` and the SAN parse: the answer was already there.

  **It is counted over the same games as the rows, deliberately, and not by
  `mistakesByThinkTime`.** That one guards on `isComparable`, because it is a *rate* and a
  shallower engine would quietly lower a numerator. Here the numerator has to stay what
  pressing the chip gives you — the rule every chip on this page follows — so the
  denominator has to be drawn from the same set or the two numbers are from two different
  slices and `5/3` becomes expressible. The depth problem is therefore *reported* instead:
  the Mark row names how many analysed games in the slice came from an older build, in
  amber, because those pull every share down in a direction nothing else on screen would
  show. There are none today and there were 138 for months.

  The Mark row keeps its denominator in the heading rather than on each chip — `?`, `??`
  and `?!` all share the one total, so per-chip it would be the same large number printed
  three times. Everywhere else it varies per chip, which is exactly what makes the row
  comparable. The full fraction with its percentage is the chip's `title`: *5 of 35 moves
  you spent over 5m on are marked — 14.3%*.

  A bucket with moves in it and nothing marked is the most useful chip on a row — a thing
  you do often and never get wrong — so an unpressable chip stays legible at 50% rather
  than fading to the 30% that made it unreadable.

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
- **A review is two kinds of writing, and the form says which is which.** It was one
  column under a single heading, **Root cause analysis**, which named only half of what
  was in it: the capped post-mortem of the moves that decided the game, and an uncapped
  pile of notes about moves that merely wanted remembering. The note cards even rendered
  *above* the entries, so the first thing under a heading about root causes was something
  that is not one.

  They are different kinds of writing and the difference is the whole point of having
  both. One answers four fixed questions, is capped at three and is about what went
  wrong; the other asks nothing, has no limit and covers either side's moves. So the
  panel is **Your review**, and inside it two groups, each with its own heading, its own
  picker, its own cards and its own empty state. The whole-game note sits in the second
  one, where it belongs.

  A rule and a count rather than a bordered box, because a box inside a box reads as a
  mistake — the `Panel` rule. The count is in the heading since it is what you look up to
  check: `1 of 3` taken apart, `2 moves` noted. Each group carries one line saying what
  it is for, in the words that tell it from the other — that line is the only new prose,
  and it earns its place by being the thing that was missing.

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
  the engine in the review form, because the rest depends on the opponent playing along; the
  continuation is still worth recording, since it is the plan you
  were actually counting on. An illegal move ends the line there, and the legal prefix is kept
  rather than the whole row being thrown away.

- **The drill asks for the whole line, not the move it starts with.** Producing the first
  move of a four-ply plan is not the same as having the plan, and the drill used to stop
  there and reveal everything — so a line you could not continue counted exactly like one
  you knew. Now, when the move you answer with is one you wrote down and that line runs
  on, the reply **you wrote for them** is played and the card asks what you do about it,
  step by step to the end of the line.

  The caveat is the one that kept this out before, and it is handled by saying it rather
  than by refusing: the continuation depends on the opponent playing along, and here they
  play along because you said they would. So the board writes *the move you wrote for
  them* under the reply, instead of letting it pass as the engine's.

  **Each step is judged by the rule that judged the first**, against a search on that
  step's own position — one per step, fetched while you think. A move that is not the
  one your line plays but still holds is a pass, because that rule has never been about
  reciting; it simply ends the sequence, since you have left the line and there is no
  continuation of yours left to ask for.

  **The attempt is recorded once, and only if every step held.** That is stricter than it
  was and is the point: a position where you find the move and then lose the thread is not
  one you have learned. It does mean a line you wrote in detail is a harder card than a
  bare move, which is the honest consequence of having claimed to know more.

  `stepsAlong` walks a line into positions — your moves are its even indices, so a step
  is a pair — and stops where a stored line stops being legal rather than throwing, since
  a line is text somebody typed. Checked against every line in the account: 45 of them
  walk to 72 steps, all legal, each one asked from the side actually to move.

  The engine reading is **keyed by the position it was read for** and the one in force is
  derived from that, rather than cleared when the step moves — clearing it would be a
  synchronous `setState` in an effect, and it would also flash the previous step's number
  onto the new position for a frame.
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
- **A solved exercise is a drill card, and nothing else is.** A sheet of positions is
  written once and then sits there; the thing you actually want is to meet them again
  later. `isDrillable` is `solved && the line has moves`, and both halves matter — an
  exercise you have not worked out is one the drill would **spoil**, which is the whole
  reason the filter is on `solved` rather than on having a line, and an exercise ticked
  off in your head has nothing to answer against.

  **The line you wrote is handed over as the one proposed move**, which is why this cost
  so little: a `PatternLine` was always a position with moves on top of it and so is an
  alternative written in a review, so `lineFor`, `stepsAlong` and the whole follow-up walk
  arrive working. A four-ply solution is four questions, with the replies you wrote for
  them played in between.

  **It is judged against the solution, not against holding**, and that is the one rule
  that had to differ. A game position asks you to keep the game alive, so anything giving
  nothing away counts; an exercise asks you to find the idea, and these positions are
  usually winning already — under the holding rule you could decline the sacrifice the
  sheet is about, stay two pawns up and be told you were right. `judgeExercise` passes the
  move your solution plays and the engine's own first choice, because a position can have
  two answers and your write-up recorded one.

  The record lives in `drills` on the **guide**, keyed by the exercise's own id — the
  shape `drills` and `verdicts` already take on a game, where a `merge` write on a map
  field merges keys, so answering one exercise never clears the rest and the sheet editor's
  own writes never touch it.

  The reveal is what differs on screen: no move you played and no post-mortem of one,
  because there is neither. What there is instead is the write-up — the comment on each
  move and the note on the whole thing — withheld until you have answered for exactly the
  reason everything else is, because it *is* the answer.

  **The dashboard filters do not apply, and the page says so by not offering them.** They
  narrow a slice of games by site, colour, clock and date, and a position off a coach's
  sheet has none of those; leaving them in force would empty the sheet the moment you
  narrowed to blitz. So the count reads `3 positions from 1 sheet` and the link beside it
  goes to the sheets rather than to the filters.

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
- **The essentials method is a section of a write-up, not a document beside it.** It was
  built as its own type, and the first real use broke it: one idea — Anastasia's Mate —
  came out as two documents, the thirteen method points in one and the board position in
  the other, with the name, kind, motif and openings typed twice and nothing keeping them
  in step. Neither half was the thing.

  So there is one document again. `essentials` is an optional field on it, present only
  once something has been answered, and `hasMethod` is what every screen asks instead of
  a type. The form folds the four questions away behind **+ Answer the essentials** until
  wanted, which is the original reason the sections were kept short — a form opening with
  eight empty boxes is eight boxes left empty.

  The question the old type was really being asked is "which have I taken apart", and the
  finder answers it directly now: an **Essentials** filter of *answered* / *still to do*,
  with no second copy of the idea to keep in step. `type` and `patternIds` are read as
  nothing and deleted on every write, via `PATTERN_RETIRED_FIELDS` — the habit `main`
  established.

- **The method's questions are a table.** `ESSENTIALS_SECTIONS` carries the key each one
  writes to, how the method numbers it, the prompt — which is also what the form shows as
  a placeholder and what the page leaves out when a question is unanswered — and, since
  the study page was rebuilt, how it looks: a `tone` and a `short` heading. The form and
  the page both render the table, so a question cannot be asked on one screen and missing
  from the other, and a fifth question arrives with its own appearance rather than falling
  through to a default nobody chose. The third question splits into `3a` and `3b` — what breaks
  the combination and what it survives — as two fields rather than one flagged list,
  because they are read as two lists and written at different times: you find what breaks
  it first, and what it survives only once you have tried.

- **Mate is a kind, not a motif.** It began as a motif group under Tactics, which buried
  a named mate among the forks and pins — and a sub-tag could only ever repeat what the
  write-up is already called, since "Anastasia's Mate" names itself. There are dozens of
  named mates and no fixed list could hold them, so the *kind* says it is a mate and the
  *name* says which. `mate` is therefore the one kind that offers no motifs at all, and
  it sits next to Tactics in the order because that is where you look for it.

- **A motif says which tactic it is, and it is not a tag.** `kind` is a short list because
  "a pattern you cannot file under one of them is usually two patterns", and that
  reasoning does not carry down a level: a fork, a pin and a deflection are all tactics
  and all different things to train. So `MOTIFS_BY_KIND` is a longer vocabulary, grouped
  the way `TAG_GROUPS` is so the names stay scannable, and keyed by kind — only tactics
  offers any, and a kind with none shows no picker rather than an empty row.

  It is deliberately **not** a review tag, though the name is. A name says which idea you
  reached for; a motif classifies it, and tagging a mistake `fork` would put a
  classification into the Mistake database competing with the write-up you actually
  wanted to point at.

  A motif its kind does not offer is dropped on read, not shown — the case that produces
  one is a document re-filed from tactics to endgame, and the form clears it on that
  press for the same reason. Both, because the read has to hold for a document that got
  one some other way.

- **The overview is a finder, not a wall of cards.** It was a heading per kind over a
  three-across grid, which reads well at four write-ups and becomes a page you scroll
  past at forty — and by then the question is "where is the one about back rank mates",
  which is a search rather than a scroll. So: a search box over the name, the motif and
  the conditions, and chips for the kind, whether the essentials are answered, and the
  motif. The list underneath is one column of rows rather than cards, because twelve
  cards is a screenful where twelve rows is a glance, and it is sorted by kind with the
  kind as a badge, so browsing everything still reads grouped without headings to scroll
  past.

  **Every chip carries the count it would give you**, measured with the *other* filters in
  force but not its own — otherwise every chip except the active one reads zero and the
  row stops being worth looking at. A kind nothing is filed under is dropped, and the
  motif row offers only the motifs actually present in what you are already looking at:
  the Control chips rule, which exists so a list of sixteen names does not appear on an
  account that has used two. Changing the kind clears the motif, since a motif belongs to
  a kind and would otherwise leave a filter on that nothing could match.

  The four live in the query string, like the dashboard's, so a narrowed list is a link
  and Back from a write-up returns to the slice you came from. An unknown value is dropped
  on read rather than passed through, so a hand-typed URL cannot invent a category.

- **An example is a game pointed at a move, or a position with moves on top of it.** The
  second is the common case for a tactic and had nowhere to go: you have the position and
  not the game it came from. `startFen` is one optional field on `PatternLine` rather than
  a second shape, so the board, the card and the tree branch on nothing at all — and the
  move tree has carried a `startFen` since it was written, with `fromPgn`, `treeFromMoves`,
  `colorAt` and `moveNumberAt` all already taking one. The editor offers the two as two
  buttons, because pasting a game and pasting a position are not the same thing to do.

  **A position with no moves on it is a complete example**, which is why `lineHasContent`
  counts a `startFen`: without that the thing this was built for would be dropped silently
  on the way to Firestore. A FEN that will not read keeps the text and says so, like the
  PGN beside it, and `lineTree` falls back to move one rather than throwing — it runs in a
  render, and a hand-edited document must not be able to take the page down.

- **`patternBody` is the writer, and `PATTERN_OPTIONAL_FIELDS` is why.** The same job
  `studyBody` and `planBody` do: an `undefined` value rejects the whole document rather
  than the field, so every optional field is set or left out and never assigned. An update
  *merges*, so a field nobody writes any more just stays — the trap `main` already fell
  into — and a tactic re-filed as an endgame would keep a motif to be read back the moment
  it was a tactic again. `updatePattern` therefore clears every optional field the body
  did not set.

- **A write-up has one description, simple or detailed, and picks which.** Conditions and
  the method answer the same question at two depths, so a form offering both is a form
  with one of them left empty — which is exactly how it looked. A chip pair chooses, the
  default is read from what is already written, and the page shows the method where it
  has been answered and the conditions where it has not.

  Switching **deletes nothing**: the other shape stays on the document, and the form says
  so in a line rather than letting text vanish without a word. That is the difference
  between choosing how to describe something and throwing the other description away.

- **The example editor holds its cursor as moves, not as node ids.** Every edit there
  writes the line back out and the tree is rebuilt from that PGN on the next render —
  and `fromPgn` mints a fresh random id for every node it reads. So a path of ids was
  stale the instant you played a move: the board found nothing at it and fell back to
  the start position while the controls went on pointing at where you were, and you had
  to step home and forward again to see what you had just played.

  `sansAlong` on the way in and `pathOfLine` on the way out, so the cursor is expressed
  in the one thing a PGN round trip preserves. A cursor whose moves no longer exist —
  the PGN was edited under it — falls back to where the line opens rather than throwing.

  The game view does not have this: it keeps the edited tree in state rather than
  round-tripping it through a PGN, so its ids survive and a path of them is safe there.

- **The long pickers are folded until asked for.** The openings list is every line you
  have saved — sixty-odd — and most write-ups are tied to none, so it was the tallest
  thing on the form and about something the write-up had nothing to do with.
  `+ Link to an opening` reveals it, and it opens by itself on a write-up that already
  links to one. Decided once in a lazy initialiser, never derived per render, or it would
  fold away under your hands as you cleared the last link — the rule a finished plan week
  already follows.

- **A point is numbered by the list, so numbering you typed is taken off when drawn.**
  The method's own write-ups come numbered — `(I)`, `(II)` — because that is how the page
  you copy from sets them out, and printing them inside a numbered list reads `(i) (I)`.
  `pointText` strips a leading numeral at the point it is drawn rather than on the way in,
  so what you typed is what is stored. Only a numeral, never a bare letter, or a point
  beginning "A piece on c4" would lose its first word.

- **A pattern's line is a whole game pointed at a move, not a position.** A FEN would have
  been less to store and would have thrown away the two things worth keeping: how you get
  there, which is what tells you a pattern is coming, and what it was worth afterwards.
  That still holds for a *game* example, which is why the PGN is kept whole; `startFen`
  above is the other case, where there is no game to keep.
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
- **A pattern board is read at the size you would study at**, with the commentary
  beside it — and the split waits for `lg` rather than `md`. At tablet width a
  two-column row squeezes the board back to the 20rem it was before it was made bigger,
  which is the opposite of the point, so below that the commentary stacks underneath.
  26rem rather than 28 on the study page, which buys the answers beside it a readable
  measure; checked at a 390px container, where it collapses to one column and the board
  takes the full 358px with nothing overflowing sideways.

- **The write-up is a study page, and the board is pinned to it.** It was four boxes of
  prose stacked above the board, so the position — which every one of those sentences is
  *about* — was a scroll away from the sentence describing it. "White Knight covers g6 and
  g8" is a claim you check by looking, and you could not look and read at once. The board
  now sits in its own column and stays put while the answers scroll past it, which is the
  whole of what made the old page hard to study from.

  **The two halves of question 3 are coloured against each other**, rose for what breaks
  it and emerald for what it survives. They were two identical grey boxes distinguishable
  only by reading the heading, on the one page where that distinction is the entire
  lesson — knowing the edges is what separates a pattern you recognise from one you can
  find. The tone comes off the sections table, not a switch on the key.

  Several examples are **chips over one board** rather than a column of boards. Three
  boards down a page is three things to scroll past to compare two of them, and the
  question a second example answers is "what does this look like somewhere else", which
  is a swap rather than a list. A write-up with no method shows **Take this one apart**
  in the space the answers would fill: an empty column beside a board reads as the page
  saying there is nothing more to know, when the truth is that nobody has written it
  down yet.
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

- **A study is the saved opening line with what you know written on it.** Not a document
  store of its own: the line is already in a repertoire tree and already matching games by
  position, so the only new thing is the prose and everything else is read off disk. The
  variants are the node's children, the games are the slice the dashboard would show, the
  patterns are the ones naming this opening — none of it stored twice, so none of it can
  drift. `study` and `updatedAt` are optional fields on `OpeningLine`, and openings finally
  gained a `normalizeOpening` on read, which was a bare cast while the type was six
  required fields and is not one now.

  The study page is the one place openings are read `{ fresh: true }`. It is the plans
  lesson: a document you write on a phone and open on a laptop must not come from the
  laptop's cache. The dashboard's hot path keeps the cache-first default.

- **The sections of a study come from a table**, `STUDY_SECTIONS` in `lib/study.ts`, for
  the reason `TRANSITIONS` and `GAME_NAMES` do. Each row says what it holds — `ideas`
  written here, `links` written here, or `derived` and read off something else — and
  carries the `hint` that renders as its own empty state, so an unwritten section says
  what belongs in it. Adding one is a row plus a panel; it is deliberately short, because
  what makes a study standard is the *shape of an idea* — a side, a rank, the pattern it
  belongs to, the games showing it — rather than eight boxes left empty.

- **References are cards; line studies are boards.** They are two sections rather than one
  because they are reached for at different moments. A reference is a video or an article:
  something you go away and read, which an iframe would only take over the page to show
  you. A line study is the moves themselves, and the whole point of naming it here is to
  play a variation without leaving the page you are writing on — so it is embedded, which
  is what lichess documents under *Embed a chess analysis in your site*.

  The embed is per **chapter**: `/study/embed/{study}/{chapter}`. A URL naming only the
  study has no chapter to show and that route answers 404, checked against the real site,
  so it falls back to a card rather than framing an error — and the section's hint says so,
  since that is the thing deciding what you get. In practice lichess puts the chapter in
  the address bar as soon as you open one.

  `lichessEmbed` **builds** the URL from parts it has checked — the host must be lichess
  over https, both ids must be the plain alphanumeric ones lichess mints — rather than
  rewriting the pasted string and handing it to an iframe. A query or fragment on the way
  in does not survive. `bg=dark` rather than the documented `auto`, because this app is
  dark whatever the device is set to and an embed reading the system theme would come up
  white inside a black page.

- **One `links` array holds both sections, and a link says which it is in.** The same shape
  as `StudyIdea.section`, so a third links section is a row in the table rather than a
  migration. A link carrying no section is **defaulted to `references`, not dropped** —
  which is the opposite of what an unknown *idea* section does, and deliberately: an idea
  has always carried one, so a bad value there is a hand-edited document naming a category
  the screen cannot draw, while a link carrying none is every link written before the
  second section existed. Throwing those away would be deleting references to make room
  for a field. `studyBody` applies the same fallback, because the writer must not be able
  to emit `section: undefined` — an undefined value rejects the whole document.

  The panel is handed the study's *whole* list and told which section is its own, rather
  than a ready-made subset. What `onChange` hands back becomes the new value of the field,
  so a panel editing a subset would drop the other section's links on every edit.

- **Thematic patterns live in `thematicPatterns`**, not `patterns`: the saved opening lines
  hold that collection id and are not moving for a cosmetic reason. See the note in
  `lib/firestore.ts`.
- **The tag vocabulary is fixed when you use it, and you are the one who fixes it.** It lives in
  `lib/tags.ts` and on your own user document, seeded with `DEFAULT_TAG_GROUPS` — grouped by what
  actually broke: tactics missed, tactics allowed, calculation, strategy, endgame, opening,
  mindset — and edited in the maintainer on the profile page. A count is only comparable across
  months if the words stay the same, which is what a fixed list bought and what the review form's
  free-text box quietly took back: anything typed into it became a tag, so `fork` and
  `italian fork` were two rows of the Mistake database describing one mistake and neither total
  was true about either. Adding a tag is a deliberate act now, which is the difference between a
  vocabulary and a pile of words. The groups carried a one-line gloss each; the names say it.

- **A tag is an id that cannot change and a name that can, and the split is what makes the list
  editable at all.** Reviews store the **id**, so renaming a tag renames it on every entry already
  carrying it with nothing rewritten, no migration and no backfill — the name is read at the point
  of display and nowhere else. Removing one is the mirror image and genuinely destructive:
  `removeTagEverywhere` strips it from every review that carries it, because a word struck off the
  list but still being counted would be worse than leaving it there. So the ✕ beside each tag says
  how many entries it would take the tag off, and nothing is written — not the vocabulary, not one
  review — until Save.

  **Each seeded tag's id is the word itself**, and that is load-bearing rather than lazy. Every
  review ever written stored exactly those strings, so the vocabulary arrives with every existing
  entry already pointing at the right tag: zero migration, and `?tag=` links stay readable. A tag
  you add later gets a minted id, because an id spelled out of the name would change with the name
  and orphan everything carrying the old one.

  Moving a tag between groups is free and had to be possible: the group is derived at read time and
  never stored on a review, so without a move control the only way to re-file a tag would be to
  delete it — which would take the entries with it. That is a trap, not a feature.

  This is the opposite bargain to a pattern's name, which *is* its tag and so leaves the old string
  behind when renamed. The difference is that a pattern is a document you wrote and a tag is a word
  in a list, and a word in a list is exactly the kind of thing you fix the spelling of.

- **An exercise guide is a sheet of positions, and an exercise is a line played from
  one.** The positions come from somewhere else — a PDF, a book, a photograph of a
  handout — so one starts as a FEN you paste in. **Lichess has no endpoint that turns a
  picture of a board into a FEN**, which was worth checking because it would have removed
  the typing: its own forum only covers going the other way, and the service that does
  scan diagrams sells a browser extension and a phone app rather than an API. So there is
  nothing to call, and the position is a box you fill.

  Everything below the position is the app's own machinery reused. An exercise's solution
  is a `PatternLine`, because that is already exactly what it is: a position with moves on
  top of it, branching where the answer depends on the reply, and a comment on any move.
  The board, the PGN round trip, the variations and the comments all arrived working —
  and it is the other half of what `startFen` was added for, a position with no game
  behind it.

  The board is the way in and the **Moves** box is the other one, because a solution often
  arrives as a line you want to paste and dragging six moves to write one down is slower
  than typing them. A bad FEN and a bad line are **two complaints, not one**: a single slot
  put "check the move notation" under the position field, which sends you to the box you
  did not touch.

- **A comment keeps the space you just typed, and trimming it was a typing bug.** The PGN
  tokenizer trimmed what it read out of `{ }`, which looks like tidying a pasted game and
  is not, because the line editors write every keystroke back out as a PGN and read it
  straight back. A comment ending in the space you had just pressed came back without it,
  so the next word landed flush against the last: "wins the piece" could only ever be
  typed as "winsthepiece". It was true in the exercise card and the pattern form alike,
  for as long as both have existed.

  The comment is now stored exactly as written. A comment that is *nothing but*
  whitespace is still no comment, because `commentAt` refuses one and `fromPgn` goes
  through it — so `{   }` in a pasted game still arrives as nothing. What is left is
  padding on a real comment, and that is the **display's** to tidy: `commentedNodes` and
  the move list trim where they draw. Storage keeps what you typed; the screen decides
  what to show. The check that matters types a whole sentence one character at a time
  through the editor's own write-and-read, which is the only way this shows up at all.

- **A branch is a shape, not an indent.** The tree put each variation behind a one-pixel
  rule at the same colour however deep it went, and a long variation wraps — so the
  second line of one branch read as the next branch down, which is precisely the point at
  which a sheet of five lines stops being readable. A block with a tint behind it has
  edges you can see wherever it runs.

  The rule and the tint fade with depth rather than changing hue. Every colour here
  already means something — red a blunder, amber a mistake, violet the engine, sky a
  selection — and a rainbow of nesting levels would be four more things to decode on a
  panel you are reading moves off. Past the third level they stop fading: the indent
  still grows, and a rule you cannot see is worse than one that repeats. The main line is
  a step brighter than the branches, because it is read where they are scanned.

- **An exercise saves on its own, and that needs a baseline.** A sheet is filled in over
  days and one position at a time, so being made to commit all twelve to keep the one you
  have just finished is the wrong unit: you either save work you were still in the middle
  of, or leave the finished one at the mercy of the device.

  A guide is one Firestore document and an exercise is an entry in its array, so the whole
  document still goes over the wire — what makes this a *partial* save is what is in it.
  `savedGuide` holds the server's own copy, and saving one exercise writes that with the
  one entry replaced, so every other edit on the device stays a draft. The order is the
  sheet's rather than the exercise's, so it is taken from the baseline and left alone;
  reordering is a change to the sheet and belongs to **Save guide**. An exercise the
  server has never seen is the one case with no place to go back to, and it is inserted
  where it sits in the working copy.

  `dirty` became **derived** in the same move, and had to. A flag can only say that
  something was touched — typing a word and deleting it again left the sheet claiming
  unsaved changes with nothing to save — and once one exercise can be saved by itself,
  "is there anything left" is a question only a comparison can answer. The folded header
  carries a dot rather than a word, because on a sheet of twelve this is something you
  scan for and "unsaved" twelve times over is a column of noise.

- **`useLineEditor` holds the cursor, and the second screen is why it exists.** Editing a
  line on a board is the pattern form's job and now the exercise card's, and the part that
  is easy to get wrong is subtle enough that two copies would be two copies to get wrong:
  the cursor is held as the *moves* leading to it, never as the ids of the nodes along the
  way, because every edit round-trips the line through its PGN and `fromPgn` mints fresh
  ids each time. The pattern form was moved onto it rather than left alone, so there is
  one of them; `patternline-checks` already covers the behaviour and passed unchanged.

- **A guide saves by a button and keeps what is unsaved on the device**, the plans model,
  because it is the same job: a sheet is filled in over days, on whichever device is to
  hand, and a page that wrote every keystroke to Firestore would lose edits to an
  out-of-order write or a suspended tab. `draft.ts` gained a third kind rather than a
  second copy. A draft outranks the server only until the server moves past it — the same
  `updatedAt` comparison a plan makes.

  Exercises you added and never filled are **dropped on save**, which is why a fresh one
  carries no title: the card shows `Exercise 3` as its placeholder and falls back to it
  when drawing, so writing the number in would be text you did not type, and text you did
  not type must not be what keeps an empty card alive. `exerciseHasContent` is also
  deliberately not `lineHasContent`, which counts any `startFen` at all — and every
  exercise has one, so it answered yes to a card nobody had touched.

  **An exercise can be moved up or down the sheet**, because the order is the sheet's and
  an import that lands one out of place should not mean typing the rest again. The
  controls sit on the folded header rather than inside the open card: reordering is
  something you do to the list, where the run of them is visible at once. `moveExercise`
  finds the exercise **by id, never by the index the render captured** — several presses
  land in one React batch and each would otherwise swap against the list as it was drawn
  rather than as it is, which is how three quick taps become one. A move off either end
  returns the list unchanged, so no caller has to range-check first. The buttons stay in
  the layout when they cannot be used, or the row would shift under the cursor as you walk
  something down the list.

  **Solved is what you said, not what the app worked out.** Nothing here checks an answer:
  a position you solved in your head and wrote one line for is as done as one annotated to
  the last move. The figure beside it is the honest middle — `started`, something written
  and not yet called finished — which is the pile worth coming back to.

- **The drill asks where the pattern stops working, because that is the part looking
  cannot teach you.** Showing a write-up's own diagram and asking what the idea is tests
  whether you remember a picture, and you are right every time within a week. Recognising
  Anastasia's Mate in the position you wrote it up from is not the skill; seeing the f6
  knight and knowing the mate is off is the skill.

  Questions 3a and 3b already record exactly that, and the useful discovery is that
  **every boundary point is a complete card with nothing new written**. A point under 3a
  is a change the pattern fails under; one under 3b is a change it survives — so the
  section a point sits in *is* the answer. That makes the drill marked rather than
  self-graded, and it worked on all eight write-ups the day it landed: 31 cards, none of
  which anyone had to author.

  A `fen` on a point upgrades a card rather than enabling one. With a position you are
  shown the board and have to find the change yourself; without one you are told the
  change in words and asked the same question. The first is the real exercise, the second
  is what the method gives away for free, and the drill needs neither to exist before it
  is useful.

  Questions 1 and 2 make no cards. They describe the pattern itself, which the example
  already shows, and neither states something that can be true or false of a position.

- **A point has an id that does not change and text that does.** A drill record is keyed
  to the point, so rewording one keeps what you have learned about it instead of quietly
  starting a new card — the same split the tag vocabulary makes, for the same reason.

  **A point written before ids existed is given one derived from its own text**, FNV-1a
  over the trimmed lower-cased string, which is stable across reads and so lets a record
  find its point again with nothing migrated. It becomes permanent the first time the
  write-up is saved. The window where that is not true is a point reworded before the
  write-up has ever been saved again, which loses a card that by definition has never been
  drilled. That is why the editor is a row per point rather than one textarea of lines:
  re-deriving the list from text on every keystroke would mint a new id the moment you
  fixed a typo. Pasting text with newlines in it still splits into a row each, which is
  the bulk entry that cost.

- **The schedule is a ladder you can read, and a miss falls all the way down.** 1, 3, 7,
  16, 35 then 90 days, forward a rung on a right answer. A plain ladder rather than SM-2's
  arithmetic, because the thing being spaced is a handful of boundaries per pattern and a
  schedule you can state in one line is one you can reason about when it puts something in
  front of you too often.

  A miss goes back to tomorrow rather than one rung down: the boundaries are the whole
  point of the method, so getting one wrong means the pattern is not learned in the way
  that matters. The queue is taken once per session and never re-sorts, the rule the game
  drill already follows — the next card must not move while you are looking at this one.

  `drills` lives on the pattern document keyed by point id, like `verdicts` and `drills`
  on a game: a `merge` write on a map field merges keys, so answering one boundary never
  clears the rest.

- **It is its own page rather than a third source in `/learn`.** The two drills share a
  concept and almost no mechanics — this one is two buttons and no engine, no filters, no
  proposed moves — and threading a foreign card type through `/learn` would have made
  every prop of `DrillCardView` conditional. The way in is from the patterns finder, which
  carries the number due and disappears when there is nothing to drill at all, because a
  control that always says nothing due is one you stop reading.

- **Clicking a boundary on the write-up puts its position on the board.** "Black has an f6
  Knight" is a claim about a board, and until you can see that board it is a sentence you
  nod at. It is the same position the drill will ask about, so reading it and being tested
  on it are one board rather than two descriptions of one. A point with no position stays
  plain text: making every sentence look clickable would promise something three quarters
  of them cannot do.

- **The maintainer reads the games fresh, and only once it is open.** It is the one screen that
  writes to many games at once, and the footprint under every ✕ is counted from that list — a
  cache missing a game written on another device would quote a number it does not have and then
  leave that game still tagged, so "deleted everywhere" would not be everywhere. It bit immediately:
  a review written the same morning was missing from the cache, and the panel listed four unfiled
  tags where there were five. Fresh means a billed read per game, so it waits for the panel to be
  opened — folded, it costs the one document the vocabulary is in, which is enough for the count in
  its heading. The same reasoning as the plans page and the study, for considerably more at stake.

- **A tag written before the vocabulary offered it is `UNFILED`, and the maintainer is where it
  gets a home.** Everything hand-written before there was a list lands there, with the number of
  entries carrying it and a group to drop it into — which is how a personal word gets into the
  vocabulary without the app's own seed carrying one user's vocabulary around. The review form
  shows such a tag too, under *Not in your vocabulary*: a tag that vanished from the form while
  staying on the review would read as the form being broken.
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
  orphaned — and still is not, now that the whole list is editable, because the group a tag is in
  is derived from the vocabulary rather than stored beside it.
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
  `−2.2` reads "I am winning" when it means the opposite. The conversion happens at the point
  of display and nowhere else: `formatEval(cp, color)` in `lib/review.ts` for a number, and
  `boardWord(end, color)` in `lib/shape.ts` for the one thing that names a *side*. The export
  keeps the stored frame, which is what its field comments say.

  **Anything that names a colour is a display of an evaluation, and the eval graph's caption
  proved it the hard way.** `boardWord` read a stored end-of-game evaluation as though it were
  already White's and so named the wrong side on every game played as Black — 14 of the 24
  games that show the sentence at all. It survived because it sat in a line where nothing
  else needs the frame: a band name is true from both ends of the board, so "best you stood:
  winning" reads correctly either way and only the colour was wrong. It sat directly under a
  chart that converts correctly, which is what finally made it visible — the caption said
  Black while the fill above it said White. The lesson is the rule above restated: a band is
  frame-free, a number and a colour are not.
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
- **The series stops where you last moved, which is not always where the game ended.**
  The first pass evaluates the position before and after each of *your* moves, so your
  opponent's reply is normally caught by the `cpBefore` of the move you played next —
  and when the game ends on that reply there is no next move of yours, so the final
  position was never evaluated at all. **44% of analysed games end that way**, always by
  exactly one ply.

  That made `offBoardOf` lie. Naming one of those asserts what the board said *at the
  end*, and a real game had 42 plies played, the last reading taken at ply 40 showing
  −9, and the move nobody saw was the piece blunder that made the opponent resign: the
  board "said draw", so the game was called `they resigned a draw` about a game that had
  stopped being drawn one ply earlier. It is exactly where the gap bites, too — a player
  who resigns straight after moving is usually resigning *because* of the move, so the
  one ply missing is the one that explains the ending.

  So `measuredToEnd` guards it: no off-board name unless the last ply of the game is one
  with a reading, and the game keeps its arc, which is read from what was measured. It
  cost 9 of 33 names and every flag and walk-away survived, because those end on your own
  move. The cure rather than the guard would be for the first pass to evaluate the final
  position too — one more search per game — but that changes what is stored, so it would
  bump `ANALYSIS_VERSION` and mark every analysed game stale.

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
- **The tab says which section you are in, and says it first.** Every page was titled
  `Chess Games Dashboard`, so eight open tabs were eight identical labels and the only way
  to find the one with the plan in it was to open them. A browser gives a tab about a dozen
  characters before it truncates, which means the words that tell one from another have to
  be the *first* ones: the section leads and the app's own name trails, where losing it to
  the ellipsis costs nothing.

  `PageShell` is where it goes, because every page already hands it the section name for
  the heading — one component rather than fourteen. The heading and the tab are not always
  the same words, though, which is what the optional `tab` prop is for: a heading has the
  width of a page and a tab has a dozen characters, so `Learn from your mistakes` becomes
  `Learn`, and `Exercise guides` and `Exercise guide` become `Guides` and `Guide` rather
  than two labels that truncate to the same thing.

  **It is a rendered `<title>`, not `document.title` in an effect**, and the difference is
  a race you cannot see. Next **streams the metadata at the end of the document**, so the
  title element arrives *after* hydration has already run the effect and the page settles
  back to the layout's default — with nothing overwriting it afterwards, which is exactly
  what makes it look as though the effect never ran. React 19 hoists a `<title>` into the
  head from wherever it is rendered, so letting React own it removes the race and puts the
  right name in the server-rendered HTML, where there is no correction to see at all.

  The root layout therefore sets **no** title: a metadata one would be a second `<title>`,
  with which of the two the browser shows left to the order the document streamed in. The
  sign-in page has no `PageShell`, so it renders its own.

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

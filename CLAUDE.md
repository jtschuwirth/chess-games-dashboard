# Chess Games Dashboard — CLAUDE.md

## Project Overview
A dashboard over your own chess games. The user signs in with Google, links their chess.com and
lichess usernames, syncs recent games into Firestore, saves named opening lines, and reads
win/draw/loss splits for all games or for the games that followed one of those lines.

## Core User Flow
1. Sign in with Google (`/`)
2. `/profile` — save chess.com / lichess usernames, and paste in a PGN to study. Syncing
   itself lives on the dashboard.
3. `/openings` — paste an opening line, name it, optionally tie it to a colour; a line that
   continues an existing one nests under it as a sub-variation. Saved lines can be edited.
4. `/dashboard` — Sync games sits at the top, folded, so bringing in new games does not
   mean leaving the page. The Opening dropdown picks "All games", any saved line, or "Not in a saved
   opening" as the last entry; narrow further by site, colour, time format, date window and your
   own rating band — the Control chips list the clocks you have actually played. Read overall / as White / as Black stats, the clock KPI, and the game phase
   analysis, plus a table breaking the slice down by sub-variation. The "Ended in" dropdown scopes
   to games that finished in one phase (`?phase=11-15`); clicking a phase's *ended* count sets the
   same filter, the way clicking a variation row sets the opening.
5. `/games/{id}` — one game: a board you can step through, the engine's marks on the move list,
   and your own root-cause analysis of the one to three moves that decided it. A second
   pass over the marked moves says what *kind* of mistake each was — a concrete line
   missed, a material advantage thrown, a plan lost — and any reading can be thrown out. Reached from any
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
│                               # VariationTable, GameRow, Chip, Board, PieceSprites,
│                               # MoveList, ReviewEditor, ReviewPanel, DrillCard,
│                               # EnginePanel, EngineMode, PatternForm, LineBoard,
│                               # PatternLineCard,
│                               # UploadPanel, AccuracyPanel, StatusTag, Section,
│                               # PlanDayCard, PlanWeekCard, PlanForm, PlanRatings,
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
- **`??` is red and `?` is amber, from one place.** The two marks are a severity scale, and a
  scale is only a scale if it says the same thing everywhere. The map was copied into two
  components and hardcoded in two more, and both hardcodes were wrong in opposite directions: the
  game view's evaluation readout wrote every mark amber, so a blunder read as a mistake, and the
  drill wrote every one red, so a mistake read as a blunder. `markColor` in `lib/review.ts` is now
  the only answer, and it returns muted for anything that is not a fault.
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
- **The engine says how much a move cost; the second pass says what kind of mistake it
  was.** "You dropped four pawns" does not distinguish being a rook up and giving it back
  from failing to find the only move that held a position worth four pawns — different
  mistakes, different training, and a tag table that cannot tell them apart sends you to
  the wrong one. `lib/verdict.ts` reads three things off the position before each marked
  move: your **material**, the engine's **score**, and **how many moves held it**. The
  verdicts are `concrete line`, `threw it`, `lost the thread` and `from level`, and the
  order they are tested in matters: hardly anything holding comes first whether or not you
  were winning, because a position with one line in it is a failure to find that line at
  +6 and at level alike.
- **A concrete line is one or two moves, not one.** `NARROW` is 2 because the same idea
  often has two move orders, or a check available from either of two squares, and a
  position with one answer written two ways is still a position with one answer. The name
  is `concrete line` rather than `only move` for the same reason, and because it is the
  honest opposite of `lost the thread`: a line to calculate against a plan to follow. The
  old `only-move` is read forward in `verdictsOf`, the same habit as every other stored
  shape here.
- **"How many moves held it" is one MultiPV search, not one search per move.** Asking the
  engine about each legal move separately would be forty searches and — worse — forty
  separate searches, which cannot be compared with each other any more than two depths
  can. One `MultiPV 5` search returns five lines scored against each other, and a move
  "holds" when `classifyMove` would not call it a fault, which is the same rule that
  marked the move in the first place. The reference is `moves[0].cp` from *that* search,
  never the stored `cpBefore`: MultiPV prunes less, so the two disagree — by 2.5 pawns on
  one position in testing — and mixing them would be the depth trap in another costume.
  `analyzeLines(fen, depth, count)` is the entry point for both engines, `analyzePosition`
  is the one-line reading of it, and the cache records how many lines were asked for so a
  position with three legal moves does not look uncached for ever.
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
- **A verdict can be thrown out, and the rejection is stored.** `dismissed` is a flag
  rather than a delete, because running the pass again must not hand back a reading you
  have already rejected — and the row stays on screen, greyed, so it is on record as
  rejected rather than quietly gone. The ingredients sit beside the verdict on the row
  (`+1 material · 2 of 5 held`) for the same reason: it is a judgement, and you should be
  able to see what it was made from before accepting it.
- **Verdicts live in `verdicts` on the game, keyed by ply**, like `drills` — a `merge`
  write on a map field merges keys, so judging two more moves never clears the rest, and
  keying by ply survives a re-analysis.
- **Analysis is one game at a time, from that game's own page.** A batch panel over the filtered
  slice used to sit on the dashboard, and the trouble with it was how easy it was to point at two
  hundred games — hours of compute for games you were never going to read. `EnginePanel` gathers
  everything the engine does to one game in one box: what it found, where it runs, the button,
  and the annotated PGN. The depth tag stays up in the title, because that is a status of the
  game rather than part of the engine's controls.
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
  `task.done + 1` from its own stale prop. A ref carries the newest plan forward synchronously, so
  edits in one batch compose all the way down.
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

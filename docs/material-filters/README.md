# Material and imbalance filters

**Parked mid-design. Nothing in `src/` has been written yet** — this directory holds the
measurements that decide the design, and the two scripts that produced them.

Resume by reading this file, then working through *Order of work* at the bottom.

## What it is for

Proposal 1 of the app review, plus what was added when picking it:

> i shoudl be able to filter by this and also imbalacnes, when i'm down a full piece when
> im down the bishop pair for N+B or N+N when i have sacriffied an exchange any imbalance
> make it searchable on the dashboard

Two things, then:

1. **A panel.** `materialByPly` (`lib/verdict.ts`) has exactly one caller — the second
   pass, for the inventory on a verdict row. So the strongest finding of the six-month
   report has no screen anywhere: you go wrong **12.7% of the time a pawn or two down
   (228/1798) against 7.7% level (399/5179)**, z=6.4. A panel in the `ThinkPanel` mould —
   a rate inside each band, each band against its own denominator.
2. **A filter**, over the bands *and* over named imbalances, on the dashboard.

Both are derived from `game.moves` alone. No storage, no re-analysis, and — unlike anything
touching breadth or `holds` — no coverage caveat, because neither needs the second pass.

## The measurement that decides the design

Material swings wildly mid-sequence. After `Rxe5` you are up a knight; after `Nxe5` you are
down the exchange. A naive *ever reached* filter counts that tempo as a position you played.

`run-lengths.ts` — how many plies a material state actually lasts, as a share of all runs of
that state, over 1073 real games:

```
  state              1     2-3     4-5     6-9   10-19     20+      runs
  piece-down       74%      6%      2%      4%      7%      6%      2131
  pawns-down       55%     13%      9%     10%      9%      3%      2619
  level            20%     18%     17%     23%     20%      3%      5028
  pawns-up         50%     15%     10%     12%     11%      2%      2882
  piece-up         73%      5%      4%      5%      7%      7%      2407
  exchange sac     43%     13%      9%      8%     19%      8%       274
```

**73% of every `piece-up` run lasts exactly one ply**, and then the distribution goes flat —
5%, 4%, 5%, 7%, 7%. That is a spike, not a tail: the one-ply state is the recapture artefact
and nothing else. `level` has no such spike (20%, then evenly spread), because level is a
state you sit in rather than pass through.

`selectivity.ts` — games matching, by how long the state had to hold:

```
  held for at least                  1     2     4     6     8    10   plies
  any imbalance                    924   821   747   693   614   526
  they had the bishop pair         325   289   253   218   177   135
  you had the bishop pair          265   239   205   176   143   100
  gave the exchange                180    96    79    68    61    52
  a bishop for a knight            171   157   131   124   107    89
  a knight for a bishop            166   134   117   106    87    63
  won the exchange                 129    67    57    50    42    33
  pawns for a piece                120    80    59    48    38    28
  a piece for pawns                109    63    45    36    20    16
  two minors for a rook             48    26    22    20    18    16
  gave the queen for pieces         46    22    20    17    17    15
  pieces for their queen            32    16    15    14    12    11
  a rook for two minors             26    15    14     9     8     8

  a piece up or better             910   425   380   340   308   277
  a piece down or worse            855   368   311   285   258   238
```

`a piece up or better` matching **910 of 1073 games** at one ply is the whole problem in one
figure, and `gave the exchange` halving from 180 to 96 is the same artefact in the imbalance
vocabulary.

### `MIN_IMBALANCE_PLIES = 4`

Two separate claims, and they should stay separate in the code comment:

- **The artefact is the one-ply state.** That is measured, not assumed: 73%/74% of the piece
  runs, with no second spike anywhere after it.
- **Four plies is a judgement on top of that** — a state that survived a move from each side
  is one you played, rather than one you passed through. It costs 45 games of 1073 against a
  threshold of 2 (380 against 425 for `piece up`), so the choice barely moves the data; 4 is
  the conservative end, and "it lasted two moves" is something a reader can check on a board
  where "it lasted two plies" is not.

## The vocabulary

Counts are games at the 4-ply threshold, so every option below has something in it.

**Material** — the weight, from `Material.pawns`:

| token | label | games |
|---|---|---|
| `band:piece-down` | a piece down or worse | 311 |
| `band:pawns-down` | a pawn or two down | 435 |
| `band:level` | **nothing was ever won** | 132 |
| `band:pawns-up` | a pawn or two up | 528 |
| `band:piece-up` | a piece up or better | 380 |

`band:level` is the one that inverts. *Ever* level is 1073 of 1073 games, so as an "ever
reached" option it would be dead. It asks the opposite instead — **no imbalance ever held
for two moves**, which is 132 games and the most interesting positional slice on the list.
Label it as the question it answers, never as "level", or it will be misread.

**A trade** — pooled non-pawn imbalance, minors counted together:

| token | label | games |
|---|---|---|
| `imb:gave-exchange` | gave the exchange | 79 |
| `imb:won-exchange` | won the exchange | 57 |
| `imb:two-minors-for-rook` | two minors for a rook | 22 |
| `imb:rook-for-two-minors` | a rook for two minors | 14 |
| `imb:gave-queen` | gave the queen for pieces | 20 |
| `imb:won-queen` | pieces for their queen | 15 |
| `imb:piece-for-pawns` | a piece for pawns | 45 |
| `imb:pawns-for-piece` | pawns for a piece | 59 |
| `imb:any` | any uneven trade | *measure* |

**Minor pieces** — equal minor count, no heavy imbalance, so the piece *types* are the
whole difference:

| token | label | games |
|---|---|---|
| `imb:bishop-pair` | you had the bishop pair | 205 |
| `imb:against-bishop-pair` | they had the bishop pair | 253 |
| `imb:bishop-for-knight` | a bishop for a knight | 131 |
| `imb:knight-for-bishop` | a knight for a bishop | 117 |

The bishop-pair test follows the request's own wording — *down the bishop pair for N+B or
N+N* — so it is `theirs.b >= 2 && mine.b < 2`, **and the minors level**, and no rook or
queen imbalance. A knight down while they hold two bishops is a piece deficit, which the
band already names; the pair is only an imbalance when the pair is the imbalance.

`imb:any` must **not** include the minor-piece group. With the bishop pair folded in it
matches 747 of 1073 (70%) and says nothing. Restricted to uneven trades it is selective —
measure it when building, the probe does not separate it yet.

## Architecture

- **`src/lib/material.ts`** (new) owns all of it: `MATERIAL_BANDS` and `IMBALANCES` as
  tables the screen renders (the `TRANSITIONS` / `GAME_NAMES` habit), `MIN_IMBALANCE_PLIES`,
  `bandOf(pawns)`, `materialRun(game)`, `materialTokens(game)`.

  **Move the material primitives out of `verdict.ts` into it** — `Material`, `Inventory`,
  `VALUE`, `GLYPH`, `PIECE_NAME`, `PIECE_ORDER`, `materialOn`, `materialEdge`,
  `materialBalance`, `materialByPly`, `imbalanceOf`, `imbalanceAt`, `materialGlyphs`,
  `materialLabel` — and have `verdict.ts` import them. They are self-contained and
  `verdict.ts` pulls in `engine.ts`; without the move, a filter and a panel would drag
  Stockfish into their module graph for a pawn count. Consumers to update:
  `components/EnginePanel.tsx` (`imbalanceAt`, `materialGlyphs`, `materialLabel`) and
  `.claude/skills/game-analysis/scripts/precompute.ts` (`materialEdge`).

- **One field, two prefixes.** `GameCriteria.material` holds `band:piece-down` or
  `imb:gave-exchange`, exactly as `shape` holds `arc:held` or `name:a clean win` — the same
  question at two widths, and one row of the filter panel rather than two. An unknown value
  is dropped on read, so a hand-typed URL cannot invent a category.

- **The tokens are a per-game index, like the opening keys.** A game's token set does not
  depend on the filter value, so it is `positionKeyMap`'s situation precisely:
  `materialTokenMap(games)` in `lib/scope.ts` beside `matchesOpening`, memoised on the
  dashboard, one replay per game.

- **`matchesCriteria` takes the tokens as an optional argument and computes them itself when
  it has none.** `/api/export` calls `matchesCriteria` directly with no index
  (`app/api/export/route.ts`), and the stated invariant is that the dashboard and the export
  cannot drift. Material is a pure function of the game, so unlike the opening tree it *can*
  be derived in there. Put the check **last** in the function so only games that survived
  every cheaper filter pay for a replay.

- **The panel is per-ply and has no threshold at all.** `MIN_IMBALANCE_PLIES` exists for the
  game-level filter — "did I play a position like this". The fault-rate table counts plies,
  so every ply counts and the denominators are moves. Keep that distinction explicit; they
  are two different questions about one series.

- **The panel must state what suppresses its own extremes.** Nothing is marked from a lost
  position, and from a won one only a fall out of winning counts, so `a piece down or worse`
  (2.5%) and `a piece up or better` (1.4%) are low *by the grading rule* rather than by the
  play. Only the middle three rows are comparable. A table that did not say so would invite
  exactly the wrong reading — the same reasoning as the think-time panel naming its
  confound.

- Clicking a row sets the filter (the figure you are reading is the filter you want next),
  but note the honest mismatch in a `title`: the row counts **moves played** in a band, the
  filter selects **games that reached** it.

## Order of work

1. `lib/material.ts`, with the primitives moved in and `verdict.ts` plus the two consumers
   re-pointed. `npx tsc --noEmit` clean before anything else.
2. The tokens: `materialTokens`, `MIN_IMBALANCE_PLIES`, the two tables. Port the probe
   classifiers as the starting point — they are already measured.
3. Checks in the scratchpad, against the real snapshot: every token's count reproduces the
   table above; a one-ply recapture never earns a token; `band:level` is the complement of
   the others; a game that will not replay yields no tokens rather than throwing.
4. `GameCriteria.material`, `matchesCriteria`, `lib/dashboard-filters.ts` read/write,
   `materialTokenMap` in `lib/scope.ts`, `scopeGames`.
5. The dashboard filter row — a `select` with an `optgroup` per group, since there are
   18 options across three groups.
6. `MaterialPanel.tsx` and its place on the dashboard.
7. Measure `imb:any`, then CLAUDE.md: the structure map, the component list, and the
   decisions above — the threshold with its measurement, the one-field-two-prefixes choice,
   `band:level` inverting, and why the primitives left `verdict.ts`.

## Running the probes

```bash
node --experimental-strip-types --import ./.claude/skills/game-analysis/scripts/hook.mjs docs/material-filters/run-lengths.ts
```

```bash
node --experimental-strip-types --import ./.claude/skills/game-analysis/scripts/hook.mjs docs/material-filters/selectivity.ts
```

Both read `.analysis-snapshot.json` (gitignored — `node .claude/skills/game-analysis/scripts/pull.mjs`
rebuilds it). Neither runs the engine. The figures above are from a 1074-game snapshot
pulled 10 Oct 2026, of which 1073 are real games.

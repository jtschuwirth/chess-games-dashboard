---
name: game-analysis
description: Answer questions about the user's own chess games from the data the app has already computed — fault rates, verdict mixes, clock behaviour, blitz against rapid, where mistakes cluster. Use whenever the user asks what their games show, asks to compare two slices, or asks to re-run an analysis under changed settings. Never runs the engine.
---

# Analysing the stored games

The app has already done the expensive work. A game's evaluations cost ninety seconds of
engine time, a marked move's candidates cost six seconds each, and all of it is on disk.
A question about that data is a file read, not a search.

## The one rule

**Never run the engine in an analysis.** Not `analyzeOnServer`, not `analyzeLines`, not a
scratch script that calls either. Computing a number here that the app could have stored
defeats the point of storing it, and the number you get is one nobody else can see.

If the data you want is missing, say so and stop. The gap is the finding, and three things
fill it — all of them by *writing the result back*, so the next reader gets it for free:

- **the first pass** — Analyse at depth 21 on a game's own page, for a game with no `analysis`
- **the second pass** — *Read N more* on the dashboard's **What went wrong** panel, which
  reads every marked move in the current filter and is resumable
- **`scripts/precompute.ts`** — the same second pass from the command line, for when there
  is a lot of it and nobody wants to watch:

  ```bash
  node --experimental-strip-types --import ./.claude/skills/game-analysis/scripts/hook.mjs .claude/skills/game-analysis/scripts/precompute.ts --limit 50
  ```

  `--limit` caps how many moves it reads, `--control 180+2` narrows it to one clock.

  It runs the engine and that is allowed, because it stores what it finds. Ask before
  starting a long one: a few hundred moves is tens of minutes of the user's CPU.

## Getting the data

```bash
node .claude/skills/game-analysis/scripts/pull.mjs
```

Read-only; copies the user's documents into `.analysis-snapshot.json` at the repo root and
prints what is in them. Re-run it when the user says they have analysed or read more.

The scripts are in the TypeScript project (`tsconfig.json` names `.claude/skills/**/*.ts`
explicitly, because a glob will not reach into a dot-directory), so `npx tsc --noEmit`
checks them. Run it after touching one: an unchecked call here reported a clean-looking
0% rather than failing.

Then write a script in the scratchpad and run it from there:

```bash
node --experimental-strip-types --import ./alias-hook.mjs your-report.ts
```

`scripts/slice.ts` has the readers. `load()` also puts the account's own settings in force,
so every band, threshold and mark matches what the user sees on screen.

```ts
import { load, slice, markedMoves, ownMoves, coverage } from '<skill>/scripts/slice'

const { games } = load()
const blitz = slice(games, { source: 'chesscom', timeControl: '180+2', since: Date.parse('2026-09-28') })
const marked = markedMoves(blitz)

console.log(coverage(marked))
```

## What is stored, and what is derived from it

| | |
|---|---|
| stored | `analysis.moves` — `cpBefore`, `cpAfter` per move of theirs, at depth 21 |
| stored | `verdicts[ply]` — `holds`, `looked`, `candidates`, `pieces`, from the second pass |
| stored | `clocks`, `review`, ratings, `openingName` |
| derived on read | the mark (`??`/`?`/`?!`), from the band the move fell out of |
| derived on read | the standing, the breadth, the descriptor, the counts |

Derived means a settings change re-reads the whole history for free. It also means a
number you quote is the number on the user's screen, which is the point.

## Coverage is part of the answer

`verdict` is null for a marked move the second pass has not read, and roughly ninety per
cent of them are. Anything involving **breadth**, `holds`, candidates or the
concrete/stable split is drawn from whichever moves happened to get opened — print
`coverage(marked)` beside it, every time.

Anything built only on `analysis.moves` — fault rates, bands, falls, clocks, accuracy — has
no such hole and covers every analysed game. Prefer those questions when the answer has to
be solid.

## Reporting

- Give the denominator with every rate, and the sample size with every share.
- Say which side of the coverage line a finding sits on.
- A difference inside what noise explains is not a finding. Check before claiming one; a
  two-proportion z test on a few dozen moves usually says no.
- State a correction plainly when a larger sample moves a number you already reported.
- Describe what is in the data. Do not invent chess advice the data does not support.

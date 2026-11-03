# Glossary

The words this project uses for its own ideas, and where each one lives.

`CLAUDE.md` explains *why* a decision was made. This file says *what a word means*, in one
line, so a term can be looked up without reading an argument. If a word here and a word
there disagree, this file is wrong — fix it.

## Storage and derivation

| term | meaning |
|---|---|
| **Measurement** | A number the engine found, or a fact a provider reported. `cpBefore`, `cpAfter`, `holds`, `clocks`, `userRating`. Stored, never recomputed. |
| **Judgement** | An opinion about measurements. A **mark**, a blunder count, a **verdict** kind, a **severity**. Derived on every read, never stored as the authority. |
| **Normalizer** | The one place a stored document becomes the shape the rest of the code expects — `normalizeAnalysis`, `normalizeOpening`, `normalizePlan`. Converts older stored shapes on read instead of migrating them. |
| **Body writer** | The one place a document is built for Firestore — `openingBody`, `patternBody`, `studyBody`, `planBody`. Sets optional fields or omits them; never assigns `undefined`, which would reject the whole document. |
| **Derived and rebuildable** | A stored copy of a fact whose authority lives elsewhere. `ratingHistory` and the **game summary** are both this: the game documents are the truth, and a rebuild can always reproduce them. |

## A game

| term | meaning |
|---|---|
| **Game document** | One stored game: `users/{uid}/games/{id}`, typed `GameRecord`. Holds the moves, the clocks, the **analysis**, the **review**, the **verdicts**. Firestore sends the whole document or none of it. |
| **Slice** | The set of games the current filters select. Decided by `matchesCriteria` (site, colour, control, dates, rating, review, tag) plus the opening filter, joined in `lib/scope.ts`. |
| **Analysis** | The first pass. `StoredAnalysis` — one entry per *your* move, carrying `cpBefore` and `cpAfter` as **measurements** and the `san` played. The mark and the counts are **judgements**, re-derived by `normalizeAnalysis`. |
| **Mark** | `?!`, `?` or `??` on one of your moves. Which marks reach a screen is the `marks` setting. |
| **Verdict** | The second pass. `MoveVerdict` — what *kind* of mistake a marked move was, read only by `/mistakes` and the game view. |
| **Review** | Your own writing on a game: up to three **mistake entries** answering four questions, plus uncapped **move notes**. |
| **Ending** | One termination vocabulary across both providers, from `normalizeEnding`. The providers disagree about `timeout`; nothing should match a raw provider string. |

## The game summary *(new — see Stage 3)*

| term | meaning |
|---|---|
| **Game summary** | One short row per game: every field `matchesCriteria` reads, plus `review`, plus the analysis `depth` and `version`. No moves, no clocks, no per-move analysis. ~400 B against a game document's ~4.4 KB. |
| **Summary shard** | One document holding every **game summary** for one calendar month, at `users/{uid}/summary/{YYYY-MM}`. Month rather than year so the shard still fits once the dashboard's per-move needs are added. |
| **Summary index** | A single document listing the **shard** keys. Read from the server so a partial cache becomes detectable — the fault `readDocs` cannot otherwise see. |
| **Rebuild** | A deliberate, manual pass that reads every game document and rewrites every **shard**. The repair path, never scheduled. |

## Openings

| term | meaning |
|---|---|
| **Opening line** | A saved, named line, optionally tied to a colour. `OpeningLine`. Stored in the `patterns` collection for historical reasons — *not* the same as a **pattern**. |
| **Position key** | FEN fields 1–3 after a line's last move. A game matches an opening if it ever reaches that key within 60 plies, which is what makes transpositions count. |
| **Way in** | An alternate move order reaching the same opening (`alts`). One entry with five routes rather than five nested entries. |
| **Played / transposed** | Whether a game reached a line by its own move order or arrived from elsewhere. Needs the literal SAN prefix; a **position key** cannot answer it. |
| **Route** | How a game got where it got — `Caro Kann › Exchange › Panov` for its own move order, `→` for a step it transposed into. |
| **Study** | What you know about an opening, written on the saved line itself rather than in a document beside it. |

## Judgement vocabulary

| term | meaning |
|---|---|
| **Band** | Where an evaluation stands: `winning`, `better`, `level`, `worse`, `losing`, `mated`. |
| **Standing** | The band you were in before you moved. |
| **Fall** | Leaving the band you were in. Staying is an inaccuracy, falling is a mistake, falling further is a blunder. A move is graded by its fall, not by what it cost. |
| **Breadth** | How much the position forgave: `sharp`, `tight`, `stable`, from how many of the engine's candidates held. Picks the column of `TRANSITIONS`. |
| **Holds** | A candidate move that keeps your **band**. Not "within a mistake of the best". |
| **Arc / texture** | A whole game's descriptor — what became of the lead, and how often it changed hands. `lib/shape.ts`. |
| **Phase** | Your own named segment of a game, in your own move numbers, from the `phases` setting. `GAME_PHASES`. |
| **Think band** | How long you took, in absolute seconds. `THINK_BANDS`, shared by the dashboard and `/mistakes` so the two cannot drift. |

## Study material

| term | meaning |
|---|---|
| **Pattern** | A thematic idea written up — a name, a kind, examples, and either conditions or the **essentials**. Stored in `thematicPatterns`. A pattern's name *is* its review tag. |
| **Essentials** | The four method questions a pattern can be taken apart against. Questions 3a and 3b hold the **boundaries**. |
| **Boundary** | A change the pattern fails under (3a) or survives (3b). The section it sits in is the answer, which is what makes the pattern drill markable with nothing extra authored. |
| **Plan** | A stretch of deliberate practice: weeks of days carrying counted tasks. `StudyPlan`. |
| **Guide** | A coach's sheet of positions. An **exercise** is a FEN plus the line you solve it on. |
| **Drill** | Any position put back in front of you with the answer withheld. Game positions, solved exercises and pattern **boundaries** each have their own. |
| **Tag** | A word from your own editable vocabulary. A tag has an id that cannot change and a name that can, so a rename needs no migration. |
| **Chess day** | 6am to 6am, so a late session counts against the day you sat down to play. `chessDayKey`. |

## Cost

| term | meaning |
|---|---|
| **Billed read** | Firestore charges one read per document it sends. The unit this project's storage decisions are made in. |
| **Cold load** | Documents come from the server. You pay **billed reads**. |
| **Warm load** | Documents come from the browser's IndexedDB cache. No billed reads — but the bytes are still read and parsed. |
| **Partial cache** | A cache holding some of a collection. `readDocs` returns any cache that is not empty, so a partial cache is today indistinguishable from a complete one. The **summary index** is the fix. |

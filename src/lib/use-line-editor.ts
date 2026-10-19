'use client'

import { useMemo, useState } from 'react'
import { lineFromTree, lineHome, lineTree } from './pattern'
import { nodeAt, pathOfLine, sansAlong, type MoveNode, type MoveTree, type Path } from './movetree'
import type { PatternLine } from '@/types/chess'

/**
 * Editing a line on a board, with a cursor that survives the edit.
 *
 * Lifted out of the pattern form when the exercise guides needed the same control, which
 * they do for the same reason: an exercise *is* a line played from a position, and the
 * thing that makes editing one hard is subtle enough that two copies of it would be two
 * copies to get wrong.
 *
 * **The cursor is held as the moves leading to it, not as the ids of the nodes along the
 * way.** Every edit writes the line back out and the tree is rebuilt from that PGN on the
 * next render — and `fromPgn` mints a fresh random id for every node it reads. So a path
 * of ids is stale the instant you play a move: the board finds nothing at it and falls
 * back to the start position while the controls go on pointing at where you were, and you
 * have to step home and forward again to see what you just played. Moves survive the
 * round trip, because they are the one thing a PGN carries.
 *
 * Null means "wherever the line opens", which is what stepping right back does. A cursor
 * whose moves no longer exist — the PGN was edited under it — falls back there too,
 * rather than throwing.
 */
export function useLineEditor(line: PatternLine, onChange: (next: PatternLine) => void) {
  const [movedSans, setMovedSans] = useState<string[] | null>(null)

  const tree = useMemo(() => lineTree(line), [line])
  const home = useMemo(() => lineHome(tree, line.startPly), [tree, line.startPly])
  const path = useMemo(
    () => (movedSans ? (pathOfLine(tree, movedSans) ?? home) : home),
    [tree, movedSans, home],
  )

  const standing: MoveNode | null = nodeAt(tree, path)

  /** Step to a node on screen, keeping the moves that lead to it rather than its id. */
  function stepTo(at: Path) {
    setMovedSans(sansAlong(tree, at))
  }

  /** An edit on the board becomes the stored line: PGN, main line and where it opens. */
  function setTree(next: MoveTree, at: Path) {
    // read against `next`, not `tree`: the path belongs to the tree the edit produced
    setMovedSans(sansAlong(next, at))
    onChange(lineFromTree(line, next, line.startPly))
  }

  /** Back to where the line opens, for an edit that replaced the moves wholesale. */
  function resetCursor() {
    setMovedSans(null)
  }

  return { tree, home, path, standing, stepTo, setTree, resetCursor }
}

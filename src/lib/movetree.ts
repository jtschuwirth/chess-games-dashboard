/**
 * A game as a tree of moves, with variations.
 *
 * Every board in this app used to carry its own idea of what a line was. A pattern
 * held `moves: string[]` and a start ply; an opening held `moves` and a position key;
 * a review alternative held a `line: string[]` that the game page replayed into a
 * throwaway `Variation` object with its own cursor, its own step rules and its own way
 * of falling back to the game. Four mechanisms, one of which could only ever hold a
 * single line with no branches at all.
 *
 * This is the one model underneath them. A node is a move and the position it leads
 * to; its children are the continuations, and **the first child is the main line** —
 * the PGN convention, so there is no separate "is this the main line" flag to keep in
 * step with the order. Playing a move that is already a child follows it rather than
 * adding a second copy, which is what makes typing a line in by hand feel like
 * stepping through one.
 *
 * It serialises to PGN with `( )` variations, because that is what every other chess
 * tool reads. chess.js parses those and then throws them away on write — the round
 * trip of `1. e4 e5 2. Nf3 (2. Bc4 Nf6) Nc6` loses the bracket entirely — so the
 * reader and the writer here are our own. chess.js is still the only authority on
 * whether a move is legal; it is the bookkeeping around it that it will not do.
 */
import { Chess } from 'chess.js'

/** The position a tree with no moves starts from. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface MoveNode {
  /** Minted when the node is created, so a path survives an edit elsewhere. */
  id: string
  san: string
  from: string
  to: string
  /** The position the move leads to. */
  fen: string
  /** What was played next. The first is the main line; the rest are variations. */
  children: MoveNode[]
  /** What is worth saying about this move. The `{ }` of a PGN. */
  comment?: string
}

export interface MoveTree {
  /** Where the tree starts. Not always move one: a pattern can start mid-game. */
  startFen: string
  /** The moves from `startFen`. The first is the main line. */
  children: MoveNode[]
}

/** Which node you are standing on: the ids from the start down to it. */
export type Path = string[]

export function emptyTree(startFen: string = START_FEN): MoveTree {
  return { startFen, children: [] }
}

/**
 * An id for a new node. Random rather than positional: a path is held across edits,
 * and an id derived from a node's place would point at a different move the moment
 * anything above it was deleted or promoted.
 */
function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/* ------------------------------------------------------------------ reading */

/** The node a path names, or null when the path has gone stale. */
export function nodeAt(tree: MoveTree, path: Path): MoveNode | null {
  let children = tree.children
  let found: MoveNode | null = null

  for (const id of path) {
    const next = children.find(child => child.id === id)
    if (!next) return null
    found = next
    children = next.children
  }

  return found
}

/** Every node along a path, root first. Empty for the start position. */
export function nodesAlong(tree: MoveTree, path: Path): MoveNode[] {
  const nodes: MoveNode[] = []
  let children = tree.children

  for (const id of path) {
    const next = children.find(child => child.id === id)
    if (!next) break
    nodes.push(next)
    children = next.children
  }

  return nodes
}

/** The position on the board at a path — after its last move, or the start. */
export function fenAt(tree: MoveTree, path: Path): string {
  const node = nodeAt(tree, path)
  return node ? node.fen : tree.startFen
}

/** The position a node was played in, which is what an engine needs to judge it. */
export function fenBefore(tree: MoveTree, path: Path): string {
  return fenAt(tree, path.slice(0, -1))
}

/** The moves along a path, in SAN. */
export function sansAlong(tree: MoveTree, path: Path): string[] {
  return nodesAlong(tree, path).map(node => node.san)
}

/**
 * The main line from a node down: follow the first child until there is none. This is
 * what "the line" means wherever one line is wanted out of a tree.
 */
export function mainLineFrom(node: MoveNode): MoveNode[] {
  const line: MoveNode[] = []
  let current: MoveNode | undefined = node

  while (current) {
    line.push(current)
    current = current.children[0]
  }

  return line
}

/** The whole tree's main line, as SAN. */
export function mainLine(tree: MoveTree): string[] {
  const first = tree.children[0]
  return first ? mainLineFrom(first).map(node => node.san) : []
}

/** How many plies have been played at a path. */
export function plyCount(path: Path): number {
  return path.length
}

/**
 * Whether a node is a variation rather than the main continuation — it is, when it is
 * not the first of its siblings. Used to draw it as a branch.
 */
export function isVariation(tree: MoveTree, path: Path): boolean {
  if (path.length === 0) return false
  const parentPath = path.slice(0, -1)
  const siblings = parentPath.length === 0 ? tree.children : (nodeAt(tree, parentPath)?.children ?? [])
  return siblings.length > 0 && siblings[0].id !== path[path.length - 1]
}

/** Every node in the tree, depth first, main line before variations. */
export function walk(tree: MoveTree): { node: MoveNode; path: Path }[] {
  const out: { node: MoveNode; path: Path }[] = []

  const visit = (children: MoveNode[], prefix: Path) => {
    for (const child of children) {
      const path = [...prefix, child.id]
      out.push({ node: child, path })
      visit(child.children, path)
    }
  }

  visit(tree.children, [])
  return out
}

/** How many moves the tree holds, variations included. */
export function size(tree: MoveTree): number {
  return walk(tree).length
}

/* ------------------------------------------------------------------ writing */

/** Replaces the children at a path, rebuilding only the nodes on the way down. */
function withChildren(tree: MoveTree, path: Path, make: (children: MoveNode[]) => MoveNode[]): MoveTree {
  if (path.length === 0) return { ...tree, children: make(tree.children) }

  const rebuild = (children: MoveNode[], depth: number): MoveNode[] =>
    children.map(child => {
      if (child.id !== path[depth]) return child
      if (depth === path.length - 1) return { ...child, children: make(child.children) }
      return { ...child, children: rebuild(child.children, depth + 1) }
    })

  return { ...tree, children: rebuild(tree.children, 0) }
}

export interface PlayedAt {
  tree: MoveTree
  /** Where the board now stands. */
  path: Path
  /** False when the move was already there and was simply followed. */
  added: boolean
}

/**
 * Plays a move at a path.
 *
 * Following an existing child rather than adding a second copy of it is the whole
 * feel of this: playing out a line you have already entered walks it, and the first
 * move that differs is where the branch appears. Returns null when the move is not
 * legal in that position — chess.js decides, here as everywhere.
 */
export function playAt(
  tree: MoveTree,
  path: Path,
  move: { from: string; to: string; promotion?: string } | { san: string },
): PlayedAt | null {
  const fen = fenAt(tree, path)

  let played
  try {
    const chess = new Chess(fen)
    played = 'san' in move ? chess.move(move.san) : chess.move(move)
    if (!played) return null
    return finish(chess.fen(), played.san, played.from, played.to)
  } catch {
    return null
  }

  function finish(after: string, san: string, from: string, to: string): PlayedAt {
    const siblings = path.length === 0 ? tree.children : (nodeAt(tree, path)?.children ?? [])
    const existing = siblings.find(child => child.san === san)

    if (existing) {
      return { tree, path: [...path, existing.id], added: false }
    }

    const node: MoveNode = { id: newId(), san, from, to, fen: after, children: [] }
    return {
      tree: withChildren(tree, path, children => [...children, node]),
      path: [...path, node.id],
      added: true,
    }
  }
}

/**
 * Grafts a SAN sequence onto the tree at a path, following what is already there.
 * Returns the tree and the path of the last move grafted; an illegal move ends the
 * line there, keeping the legal prefix — the rule the review form already follows.
 */
export function addLine(tree: MoveTree, path: Path, sans: string[]): { tree: MoveTree; path: Path } {
  let current = tree
  let at = path

  for (const san of sans) {
    const played = playAt(current, at, { san })
    if (!played) break
    current = played.tree
    at = played.path
  }

  return { tree: current, path: at }
}

/** Removes a move and everything under it. */
export function removeAt(tree: MoveTree, path: Path): MoveTree {
  if (path.length === 0) return tree
  const id = path[path.length - 1]
  return withChildren(tree, path.slice(0, -1), children => children.filter(child => child.id !== id))
}

/**
 * Makes a variation the main line, by moving it to the front of its siblings.
 *
 * One step rather than all the way up: promoting repeatedly is how you say "this line
 * is the point now", and doing it in one jump would reorder branches you never looked
 * at on the way.
 */
export function promoteAt(tree: MoveTree, path: Path): MoveTree {
  if (path.length === 0) return tree
  const id = path[path.length - 1]

  return withChildren(tree, path.slice(0, -1), children => {
    const at = children.findIndex(child => child.id === id)
    if (at <= 0) return children

    const next = [...children]
    const [node] = next.splice(at, 1)
    next.splice(at - 1, 0, node)
    return next
  })
}

/** Sets or clears what is written on a move. An empty comment is removed outright. */
export function commentAt(tree: MoveTree, path: Path, comment: string): MoveTree {
  if (path.length === 0) return tree
  const id = path[path.length - 1]

  return withChildren(tree, path.slice(0, -1), children =>
    children.map(child => {
      if (child.id !== id) return child
      const next = { ...child }
      if (comment.trim().length > 0) next.comment = comment
      else delete next.comment
      return next
    }),
  )
}

/** A linear tree from a move list — a game, an opening, a pattern as they are stored. */
export function treeFromMoves(sans: string[], startFen: string = START_FEN): MoveTree {
  return addLine(emptyTree(startFen), [], sans).tree
}

/**
 * Every root-to-leaf line in the tree, as SAN sequences, main line first.
 *
 * What a tree looks like to anything that only speaks in lines — a review
 * alternative, a merge, an export.
 */
export function lines(tree: MoveTree): string[][] {
  const out: string[][] = []

  const visit = (children: MoveNode[], prefix: string[]) => {
    for (const child of children) {
      const line = [...prefix, child.san]
      if (child.children.length === 0) out.push(line)
      else visit(child.children, line)
    }
  }

  visit(tree.children, [])
  return out
}

/**
 * Grafts everything in one tree onto another.
 *
 * Used to put several sources on one board: the game as played, the variations you
 * saved on it, and the lines your review proposes. `addLine` follows a move already
 * there rather than adding a second copy, so a line two sources agree on stays one
 * branch — which is what makes merging safe to do on every read.
 *
 * The first tree's ordering wins, so whatever it calls the main line stays the main
 * line. Both must start from the same position; a mismatch returns the first
 * unchanged, because grafting moves onto a position they were not played in builds a
 * tree that is wrong rather than empty.
 */
export function mergeTrees(into: MoveTree, from: MoveTree): MoveTree {
  if (into.startFen !== from.startFen) return into

  let merged = into
  for (const line of lines(from)) merged = addLine(merged, [], line).tree
  return merged
}

/**
 * The path to a point on the main line, by how many plies have been played.
 *
 * The position *before* ply `n` is `mainPath(tree, n)`, which is what you want when
 * grafting an alternative to a move: an alternative is played from where that move
 * was played.
 */
export function mainPath(tree: MoveTree, plies: number): Path {
  const path: Path = []
  let children = tree.children

  for (let at = 0; at < plies; at++) {
    const next = children[0]
    if (!next) break
    path.push(next.id)
    children = next.children
  }

  return path
}

/**
 * The path of a SAN sequence from the start, or null if the tree does not hold it.
 * How a stored line — a review alternative, a game's own moves — is located in a tree.
 */
export function pathOfLine(tree: MoveTree, sans: string[]): Path | null {
  const path: Path = []
  let children = tree.children

  for (const san of sans) {
    const next = children.find(child => child.san === san)
    if (!next) return null
    path.push(next.id)
    children = next.children
  }

  return path
}

/* ------------------------------------------------------------- move numbers */

/** Whose move it is at a ply index, counting from the tree's own start position. */
export function colorAt(startFen: string, ply: number): 'white' | 'black' {
  const first = startFen.split(' ')[1] === 'b' ? 1 : 0
  return (ply + first) % 2 === 0 ? 'white' : 'black'
}

/** The full-move number of a ply, counting from the tree's own start position. */
export function moveNumberAt(startFen: string, ply: number): number {
  const parts = startFen.split(' ')
  const first = Number(parts[5] ?? 1) || 1
  const blackFirst = parts[1] === 'b'
  return first + Math.floor((ply + (blackFirst ? 1 : 0)) / 2)
}

/**
 * How a move is written in a line: `12. Nf3`, or `12... Nf3` when it is Black's or
 * when it opens a variation and needs the number repeating.
 */
export function moveLabel(startFen: string, ply: number, san: string, forceNumber = false): string {
  const number = moveNumberAt(startFen, ply)
  const white = colorAt(startFen, ply) === 'white'
  if (white) return `${number}. ${san}`
  return forceNumber ? `${number}... ${san}` : san
}

/* -------------------------------------------------------------------- PGN */

/**
 * The tree as PGN movetext, variations in brackets and comments in braces.
 *
 * Written by hand because chess.js drops both on the way out. A variation is written
 * directly after the move it is an alternative to, which is what every reader expects
 * — and it always carries its move number, because a bracket opening with a bare SAN
 * reads as a continuation rather than a replacement.
 */
export function toPgn(tree: MoveTree): string {
  /** One branch: the move, what is written on it, and everything below it. */
  const branch = (node: MoveNode, ply: number, numberNext: boolean): string => {
    const parts: string[] = [moveLabel(tree.startFen, ply, node.san, numberNext)]
    if (node.comment) parts.push(`{${node.comment}}`)

    // its own siblings-below are handled by `write`, which treats child 0 as the line
    const below = write(node.children, ply + 1, false)
    if (below) parts.push(below)

    return parts.join(' ')
  }

  const write = (children: MoveNode[], ply: number, numberNext: boolean): string => {
    if (children.length === 0) return ''

    const [main, ...variations] = children
    const parts: string[] = [moveLabel(tree.startFen, ply, main.san, numberNext)]
    if (main.comment) parts.push(`{${main.comment}}`)

    // each variation is an alternative to `main`, written straight after it and
    // always carrying its move number — a bracket opening with a bare SAN reads as a
    // continuation rather than a replacement
    for (const variation of variations) {
      parts.push(`(${branch(variation, ply, true)})`)
    }

    // a move following a bracket needs its number again, or it reads as part of it
    const after = write(main.children, ply + 1, variations.length > 0)
    if (after) parts.push(after)

    return parts.join(' ')
  }

  return write(tree.children, 0, true)
}

interface Token {
  kind: 'move' | 'open' | 'close' | 'comment'
  text: string
}

/** Movetext split into the pieces that mean something. Headers and results are dropped. */
function tokenize(pgn: string): Token[] {
  const tokens: Token[] = []
  let at = 0

  // headers first: everything in [ ] before the moves start
  const body = pgn.replace(/\[[^\]]*\]/g, ' ')

  while (at < body.length) {
    const char = body[at]

    if (/\s/.test(char)) {
      at++
    } else if (char === '(') {
      tokens.push({ kind: 'open', text: '(' })
      at++
    } else if (char === ')') {
      tokens.push({ kind: 'close', text: ')' })
      at++
    } else if (char === '{') {
      /*
        Kept exactly as written, spaces and all. Trimming here read as tidying a pasted
        PGN and was in fact a typing bug: the line editors write every keystroke back out
        as a PGN and read it straight back, so a comment ending in the space you had just
        pressed came back without it. "wins the piece" could only ever be typed as
        "winsthepiece" — the space was deleted as fast as it was entered, in the exercise
        card and the pattern form alike.

        A comment that is nothing but whitespace is still dropped, because `commentAt`
        refuses one, so `{   }` from a pasted game still arrives as no comment at all.
        What is left is padding on a real comment, which is the display's to tidy.
      */
      const end = body.indexOf('}', at)
      const stop = end === -1 ? body.length : end
      tokens.push({ kind: 'comment', text: body.slice(at + 1, stop) })
      at = stop + 1
    } else if (char === ';') {
      // a rest-of-line comment
      const end = body.indexOf('\n', at)
      at = end === -1 ? body.length : end + 1
    } else if (char === '$') {
      while (at < body.length && !/[\s()]/.test(body[at])) at++
    } else {
      let end = at
      while (end < body.length && !/[\s(){};]/.test(body[end])) end++
      const word = body.slice(at, end)
      at = end

      // move numbers, results and the odd stray dot carry nothing we need
      if (/^\d+\.*$/.test(word)) continue
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(word)) continue
      if (word === '...' || word.length === 0) continue

      tokens.push({ kind: 'move', text: word.replace(/^\d+\.+/, '') })
    }
  }

  return tokens
}

/**
 * A PGN back into a tree, variations and comments included.
 *
 * A bracket is an alternative to the move *before* it, so it is played from that
 * move's own starting position — getting that backwards is the classic way to read a
 * PGN wrongly, and it produces a tree that looks right until the first branch.
 *
 * An illegal move ends the line it is in and the rest of that bracket is skipped,
 * rather than the whole paste being thrown away: the same rule the review form
 * follows for a typed line, and the one that keeps a stray token from costing you
 * everything you pasted.
 */
export function fromPgn(pgn: string, startFen: string = START_FEN): MoveTree {
  const tokens = tokenize(pgn)
  let tree = emptyTree(startFen)

  /** Where the next move goes, and where a bracket would branch from. */
  let path: Path = []
  let previous: Path = []
  const stack: { path: Path; previous: Path }[] = []

  /**
   * How many brackets deep we are inside a line that stopped making sense. Once a
   * move will not play, the moves after it in that bracket are being read from a
   * position they were never written for, so they are skipped rather than grafted
   * somewhere wrong. Depth 0 means we are reading normally.
   */
  let skipping = 0

  for (const token of tokens) {
    if (token.kind === 'open') {
      if (skipping > 0) {
        skipping++
        continue
      }
      stack.push({ path, previous })
      // a variation replaces the last move played, so it starts where that move did
      path = previous
      continue
    }

    if (token.kind === 'close') {
      if (skipping > 0) {
        skipping--
        if (skipping > 0) continue
        // the bad line ended with this bracket; fall through to resume where it began
      }

      const resumed = stack.pop()
      if (resumed) {
        path = resumed.path
        previous = resumed.previous
      }
      continue
    }

    if (skipping > 0) continue

    if (token.kind === 'comment') {
      if (path.length > 0) tree = commentAt(tree, path, token.text)
      continue
    }

    const played = playAt(tree, path, { san: token.text })
    if (!played) {
      // inside a bracket, abandon the rest of it; at the top level there is nothing
      // left to resume into, so the paste simply ends here
      if (stack.length > 0) skipping = 1
      else break
      continue
    }

    tree = played.tree
    previous = path
    path = played.path
  }

  return tree
}

/** Whether two trees differ, which is what "unsaved" means on a board. */
export function treeChanged(a: MoveTree, b: MoveTree): boolean {
  return toPgn(a) !== toPgn(b) || a.startFen !== b.startFen
}

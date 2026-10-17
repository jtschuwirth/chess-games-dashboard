'use client'

import { useMemo, useState } from 'react'
import Chip from '@/components/Chip'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import { buildOpeningTree, openingLabel, type OpeningNode } from '@/lib/opening'
import {
  START_FEN,
  commentAt as setComment,
  mainLine,
  mainPath,
  moveLabel,
  nodeAt,
  pathOfLine,
  sansAlong,
  type MoveTree,
  type Path,
} from '@/lib/movetree'
import {
  ESSENTIALS_SECTIONS,
  KIND_LABEL,
  essentialsHaveContent,
  MOTIFS_BY_KIND,
  PATTERN_KINDS,
  clampStartPly,
  emptyEssentials,
  emptyLine,
  emptyPositionLine,
  fenIsValid,
  newPoint,
  lineFromTree,
  lineHasContent,
  lineHome,
  lineOrientation,
  lineTree,
  motifsFor,
  parsePatternPgn,
} from '@/lib/pattern'
import type {
  EssentialsPoint,
  NewPattern,
  OpeningLine,
  PatternEssentials,
  PatternKind,
  PatternLine,
} from '@/types/chess'

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="text-xs uppercase tracking-wide text-zinc-500">
      {children}
      {hint && <span className="normal-case tracking-normal text-zinc-700"> — {hint}</span>}
    </span>
  )
}

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/**
 * One line of a pattern: what it is called, the game, where the board opens, and what
 * to notice. The board sits beside the fields rather than under them, because pointing
 * the line at the right move is the one thing here you cannot do by typing.
 *
 * The comment field is for whichever move is on the board, so writing a line up is
 * stepping and typing rather than filling in a list of moves you have to name.
 */
function LineFields({
  line,
  titlePlaceholder,
  onChange,
  onRemove,
}: {
  line: PatternLine
  titlePlaceholder: string
  onChange: (next: PatternLine) => void
  onRemove?: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  /**
   * Where the cursor is, held as the *moves* leading to it rather than the ids of the
   * nodes along the way.
   *
   * Every edit here writes the line back out and the tree is rebuilt from that PGN on
   * the next render — and `fromPgn` mints a fresh random id for every node it reads. So
   * a path of ids is stale the instant you play a move: the board found nothing at it
   * and fell back to the start position while the controls went on pointing at where
   * you were. Moves survive the rebuild, because they are what the PGN carries.
   *
   * Null means "wherever the line opens", which is what stepping right back does.
   */
  const [movedSans, setMovedSans] = useState<string[] | null>(null)

  const tree = useMemo(() => lineTree(line), [line])
  const home = useMemo(() => lineHome(tree, line.startPly), [tree, line.startPly])
  const path = useMemo(
    // a line that no longer plays — the PGN was edited under it — opens at home rather
    // than throwing, the same fallback a bad FEN gets
    () => (movedSans ? (pathOfLine(tree, movedSans) ?? home) : home),
    [tree, movedSans, home],
  )
  const standing = nodeAt(tree, path)

  /** Step to a node of the tree on screen, keeping the moves that lead to it. */
  function stepTo(at: Path) {
    setMovedSans(sansAlong(tree, at))
  }

  /** An edit on the board becomes the stored line: PGN, main line and where it opens. */
  function setTree(next: MoveTree, at: Path) {
    // read against `next`, not `tree`: the path belongs to the tree the edit produced
    setMovedSans(sansAlong(next, at))
    setError(null)
    onChange(lineFromTree(line, next, line.startPly))
  }

  /** Whether this example is a position with moves on it, or a whole game. */
  const fromPosition = line.startFen !== undefined

  function setPgn(pgn: string) {
    // The PGN is kept whatever happens, so a typo does not throw away what you pasted.
    try {
      const moves = parsePatternPgn(pgn, line.startFen)
      setError(null)
      setMovedSans(null)
      onChange({ ...line, pgn, moves, startPly: clampStartPly(line.startPly, moves) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that PGN.')
      onChange({ ...line, pgn })
    }
  }

  /**
   * The position is kept whatever happens, the same as the PGN: half a pasted FEN is
   * not a reason to lose the half that arrived. The moves are re-read from the new
   * position, since a line written for one position rarely plays from another.
   */
  function setFen(startFen: string) {
    try {
      const moves = parsePatternPgn(line.pgn, startFen)
      setError(null)
      setMovedSans(null)

      // the orientation is not written here: `lineOrientation` derives it from this
      // position, so the stored field only ever holds a flip you asked for
      onChange({ ...line, startFen, moves, startPly: clampStartPly(line.startPly, moves) })
    } catch {
      // the field being edited is the position, so the complaint has to be about that:
      // "check the move notation" sends you to the box you did not touch — which is why
      // the thrown message is replaced rather than shown
      setError(
        !fenIsValid(startFen)
          ? 'Invalid FEN — check the position and try again.'
          : 'Those moves do not play from this position.',
      )
      onChange({ ...line, startFen })
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] gap-4 border border-zinc-800 rounded-xl p-3 bg-zinc-950/40">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <input
            value={line.title}
            onChange={event => onChange({ ...line, title: event.target.value })}
            placeholder={titlePlaceholder}
            className={`${INPUT} flex-1 min-w-0`}
          />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors shrink-0"
            >
              Remove
            </button>
          )}
        </div>

        {fromPosition && (
          <div className="flex flex-col gap-1.5">
            <Label hint="the moves below are played from here">Position</Label>
            <textarea
              value={line.startFen ?? ''}
              onChange={event => setFen(event.target.value)}
              rows={2}
              placeholder={START_FEN}
              className={`${INPUT} font-mono resize-y`}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label
            hint={
              fromPosition
                ? 'the moves from the position above — a position on its own is a complete example'
                : 'brackets are variations, braces are comments — both survive a round trip'
            }
          >
            {fromPosition ? 'Moves' : 'PGN'}
          </Label>
          <textarea
            value={line.pgn}
            onChange={event => setPgn(event.target.value)}
            rows={fromPosition ? 3 : 5}
            placeholder={fromPosition ? 'Qxh7+ Kxh7 Rh3#' : '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4'}
            className={`${INPUT} font-mono resize-y`}
          />
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : (
            line.moves.length > 0 && (
              <span className="text-xs text-zinc-600">{line.moves.length} half-moves read</span>
            )
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Note</Label>
          <textarea
            value={line.note}
            onChange={event => onChange({ ...line, note: event.target.value })}
            rows={2}
            placeholder="Black gets ...c5 in before White can hold the centre"
            className={`${INPUT} resize-y`}
          />
        </div>
      </div>

      <div className="w-full max-w-[26rem] mx-auto lg:mx-0 flex flex-col gap-3">
        {/*
          The same board the game view uses. Playing a move here extends the line, or
          branches it where it differs — a pattern usually has an "if they play this
          instead" in it, and before the tree there was nowhere to put one.
        */}
        <MoveTreeBoard
          tree={tree}
          path={path}
          onPath={stepTo}
          onTree={setTree}
          orientation={lineOrientation(line)}
          onFlip={() =>
            onChange({ ...line, orientation: lineOrientation(line) === 'white' ? 'black' : 'white' })
          }
          home={home}
        />

        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => onChange({ ...line, startPly: path.length })}
            disabled={path.length === home.length || !onMainLine(tree, path)}
            title={
              onMainLine(tree, path)
                ? 'Open the line on this move'
                : 'A line opens on its own moves, not inside a variation'
            }
            className="text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:hover:text-zinc-500"
          >
            open here
          </button>
          <span className="text-zinc-600">
            {line.startPly === 0
              ? fromPosition
                ? 'opens on the position'
                : 'opens before the first move'
              : `opens on ${moveLabel(tree.startFen, line.startPly - 1, mainLine(tree)[line.startPly - 1] ?? '', true)}`}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          {/* the move is mono and in its own case — "QC2" is not a move */}
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Comment on{' '}
            <span className="normal-case tracking-normal font-mono text-zinc-400">
              {standing ? moveLabel(tree.startFen, path.length - 1, standing.san, true) : 'start'}
            </span>
          </span>
          <textarea
            value={standing?.comment ?? ''}
            onChange={event => setTree(setComment(tree, path, event.target.value), path)}
            disabled={!standing}
            rows={3}
            placeholder={standing ? 'what this move is for' : 'step to a move to write on it'}
            className={`${INPUT} resize-y disabled:opacity-40`}
          />
        </div>
      </div>
    </div>
  )
}

/** Whether a path follows the main line all the way, which is where a line may open. */
function onMainLine(tree: MoveTree, path: Path): boolean {
  return mainPath(tree, path.length).join('/') === path.join('/')
}

/**
 * Every saved opening in tree order, each knowing what it hangs under.
 *
 * `flattenTree` gives the order and the depth but drops the trail, and the trail is the
 * part that matters here: filtering has to be able to keep a match's ancestors on screen,
 * or "Exchange variation" appears four times with nothing to tell them apart.
 */
function rowsWithTrail(
  nodes: OpeningNode[],
  trail: string[] = [],
): { node: OpeningNode; trail: string[] }[] {
  return nodes.flatMap(node => [
    { node, trail },
    ...rowsWithTrail(node.children, [...trail, node.opening.id]),
  ])
}

/** Past this many, scanning the list beats scrolling it. */
const FILTER_THRESHOLD = 8

/**
 * Picking the openings a pattern turns up in.
 *
 * A flat row of chips was wrong in a way that only shows with real data: half a
 * repertoire's lines are called "Exchange variation", and in a flat list they are four
 * identical chips. Nesting them under the line they branch from is the only thing that
 * tells them apart, so this keeps the same tree the dashboard and the openings page use —
 * one ordering of a repertoire, everywhere.
 */
function OpeningPicker({
  openings,
  selected,
  onToggle,
}: {
  openings: OpeningLine[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => rowsWithTrail(buildOpeningTree(openings)), [openings])

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (needle.length === 0) return rows

    // A match keeps its whole trail, so you can still see what it branches from.
    const keep = new Set<string>()
    for (const row of rows) {
      if (!openingLabel(row.node.opening).toLowerCase().includes(needle)) continue
      keep.add(row.node.opening.id)
      for (const id of row.trail) keep.add(id)
    }
    return rows.filter(row => keep.has(row.node.opening.id))
  }, [rows, filter])

  return (
    <div className="flex flex-col gap-1.5">
      {openings.length > FILTER_THRESHOLD && (
        <input
          value={filter}
          onChange={event => setFilter(event.target.value)}
          placeholder="filter openings"
          className={`${INPUT} py-1.5`}
        />
      )}

      <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800/60">
        {shown.length === 0 ? (
          <p className="px-3 py-2 text-xs text-zinc-600">Nothing matches that.</p>
        ) : (
          shown.map(({ node }) => {
            const active = selected.includes(node.opening.id)
            return (
              <button
                key={node.opening.id}
                type="button"
                onClick={() => onToggle(node.opening.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
                }`}
              >
                <span
                  className={`w-3 h-3 shrink-0 rounded-sm border flex items-center justify-center leading-none text-[9px] ${
                    active ? 'bg-zinc-200 border-zinc-200 text-zinc-900' : 'border-zinc-700'
                  }`}
                >
                  {active ? '✓' : ''}
                </span>
                <span className="min-w-0 truncate" style={{ paddingLeft: node.depth * 14 }}>
                  {node.depth > 0 && <span className="text-zinc-600">↳ </span>}
                  {openingLabel(node.opening)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * Writing up one pattern. The name is also the review tag, which is why it is asked for
 * first and why the form says so: it is the string you will be picking off a list months
 * from now with the game in front of you, not a title.
 */
export default function PatternForm({
  initial,
  openings,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: NewPattern
  openings: OpeningLine[]
  busy?: boolean
  onSubmit: (pattern: NewPattern) => Promise<void> | void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<PatternKind>(initial?.kind ?? 'tactics')
  const [motif, setMotif] = useState<string | null>(initial?.motif ?? null)
  const [essentials, setEssentials] = useState<PatternEssentials>(
    initial?.essentials ?? emptyEssentials(),
  )
  const [conditions, setConditions] = useState((initial?.conditions ?? []).join('\n'))
  // always one editor on screen: a pattern with nothing in it is still being written
  const [examples, setExamples] = useState<PatternLine[]>(
    initial?.examples?.length ? initial.examples : [emptyLine()],
  )
  const [openingIds, setOpeningIds] = useState<string[]>(initial?.openingIds ?? [])
  /** Whether the opening picker is open. Decided once, from what is already linked. */
  const [linking, setLinking] = useState(() => (initial?.openingIds ?? []).length > 0)
  const [error, setError] = useState<string | null>(null)
  /*
   * How this one is described: a couple of conditions, or the method in full.
   *
   * One or the other, because they answer the same question at two depths and a form
   * offering both is a form with one of them left empty — which is what it looked like.
   * Decided once, in a lazy initialiser, from what is already written: deriving it every
   * render would switch the editor out from under you as you cleared the last point.
   */
  const [detailed, setDetailed] = useState(() =>
    essentialsHaveContent(initial?.essentials ?? emptyEssentials()),
  )

  async function submit() {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('A write-up needs a name — it is the tag you will reach for in a review.')
      return
    }

    setError(null)
    const next: NewPattern = {
      name: trimmed,
      kind,
      conditions: conditions
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0),
      // an example you started and left blank is not worth storing
      examples: examples.filter(lineHasContent),
      openingIds,
      createdAt: initial?.createdAt ?? Date.now(),
    }

    // `patternBody` strips and checks all of this again on the way to Firestore; set
    // here only what this write-up actually has, so nothing carries an undefined field
    if (motif) next.motif = motif
    if (essentialsHaveContent(essentials)) next.essentials = essentials

    await onSubmit(next)
  }

  /** The motifs this kind offers, which is none for three of the four. */
  const motifGroups = MOTIFS_BY_KIND[kind]

  /**
   * Changing the kind drops a motif the new kind does not offer.
   *
   * Done on the press rather than derived in a render: the picker has to be able to
   * show nothing selected, and re-deriving it every render would fight the click that
   * selected it. `normalizePattern` drops a stale one on read as well, so a document
   * that got one some other way still cannot show it.
   */
  function pickKind(next: PatternKind) {
    setKind(next)
    if (motif && !motifsFor(next).includes(motif)) setMotif(null)
  }

  /**
   * Asking for a position swaps out the empty example the form starts with.
   *
   * The form always shows one card so there is something to write in, and that card is
   * a game. Appending a position under it leaves an untouched game card in the way that
   * you then have to Remove — and it is dropped on save regardless, so it was never
   * anything but clutter. Only the position button does this: swapping an empty game
   * for another empty game is a press that appears to do nothing.
   */
  function addPosition() {
    setExamples(prev =>
      prev.length === 1 && !lineHasContent(prev[0])
        ? [emptyPositionLine()]
        : [...prev, emptyPositionLine()],
    )
  }

  /**
   * One of the method's four lists, edited a point at a time.
   *
   * A row each rather than one textarea of lines, because a point now has an id and
   * a drill record keyed to it: re-deriving the list from text on every keystroke
   * would mint a new id the moment you fixed a typo in a point, and take whatever you
   * had learned about it along with the old id.
   *
   * The cost is bulk entry, which `setPointText` buys back: text arriving with
   * newlines in it, which is what pasting a list does, splits into a row each.
   */
  function setPoints(key: keyof PatternEssentials, next: EssentialsPoint[]) {
    setEssentials(current => ({ ...current, [key]: next }))
  }

  function setPointText(key: keyof PatternEssentials, index: number, text: string) {
    const lines = text.split('\n')
    setEssentials(current => {
      const points = current[key]
      const replacement =
        lines.length === 1
          ? [{ ...points[index], text }]
          : // a pasted list: the row keeps its id and the rest arrive as new points
            lines.map((line, at) =>
              at === 0 ? { ...points[index], text: line } : newPoint(line),
            )
      return {
        ...current,
        [key]: [...points.slice(0, index), ...replacement, ...points.slice(index + 1)],
      }
    })
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <div className="flex flex-col gap-1.5 min-w-0">
          <Label hint="also the review tag">Name</Label>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="accelerated fianchetto"
            className={INPUT}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Kind</Label>
          <div className="flex gap-1 flex-wrap">
            {PATTERN_KINDS.map(option => (
              <Chip key={option} active={kind === option} onClick={() => pickKind(option)}>
                {KIND_LABEL[option]}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/*
        Only where the kind offers any, which today is tactics alone. A kind with no
        motifs shows no picker rather than an empty row — there is nothing to choose.
      */}
      {motifGroups.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label hint="which tactic it is">Motif</Label>
          <div className="flex flex-col gap-1.5">
            {motifGroups.map(group => (
              <div key={group.name} className="flex gap-1.5 flex-wrap items-center">
                <span className="text-[11px] uppercase tracking-wide text-zinc-600 w-full sm:w-44 shrink-0">
                  {group.name}
                </span>
                {group.motifs.map(option => (
                  <Chip
                    key={option}
                    active={motif === option}
                    onClick={() => setMotif(motif === option ? null : option)}
                  >
                    {option}
                  </Chip>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        The method's own questions, rendered from `ESSENTIALS_SECTIONS` rather than
        written out here, so a screen cannot describe a question that does not exist.
        One point per line: the answers are short lettered points, not paragraphs, and a
        textarea per point would be four forms instead of four fields.
      */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 items-baseline flex-wrap">
          <Label>Description</Label>
          <div className="flex gap-1.5">
            <Chip active={!detailed} onClick={() => setDetailed(false)}>
              simple
            </Chip>
            <Chip
              active={detailed}
              title="The essentials method: what each piece is responsible for, what weakness lets it happen, what would break it and what it survives"
              onClick={() => setDetailed(true)}
            >
              essentials
            </Chip>
          </div>
        </div>

        {/*
          Nothing is deleted by switching — the other shape stays on the document, and
          this says so rather than letting text you wrote vanish without a word.
        */}
        {detailed && conditions.trim().length > 0 && (
          <p className="text-xs text-zinc-600">
            A simple description is written too, and is not shown while the essentials
            are. Switch back to read or clear it.
          </p>
        )}
        {!detailed && essentialsHaveContent(essentials) && (
          <p className="text-xs text-zinc-600">
            The essentials are answered, and are not shown while this is. Switch back to
            read or clear them.
          </p>
        )}
      </div>

      {detailed ? (
        <div className="flex flex-col gap-4 border-l-2 border-zinc-800 pl-4">
          {ESSENTIALS_SECTIONS.map(section => {
            const points = essentials[section.key]
            /*
              Only the two halves of question 3 can carry a position. 1 and 2 describe the
              pattern itself, which the example already shows; 3a and 3b describe a
              *changed* board, and that is the one thing a drill can put in front of you
              and ask a question whose answer you do not already have by heart.
            */
            const testable = section.tone !== 'neutral'

            return (
              <div key={section.key} className="flex flex-col gap-1.5">
                <Label hint={points.length === 0 ? section.hint : undefined}>
                  {section.number}. {section.title}
                </Label>

                {points.map((point, index) => (
                  <PointRow
                    key={point.id}
                    point={point}
                    testable={testable}
                    onText={text => setPointText(section.key, index, text)}
                    onFen={fen =>
                      setPoints(
                        section.key,
                        points.map((entry, at) => {
                          if (at !== index) return entry
                          if (fen) return { ...entry, fen }
                          // rebuilt without it rather than set to undefined, which
                          // Firestore refuses outright
                          return { id: entry.id, text: entry.text }
                        }),
                      )
                    }
                    onRemove={() =>
                      setPoints(
                        section.key,
                        points.filter((_, at) => at !== index),
                      )
                    }
                  />
                ))}

                <button
                  type="button"
                  onClick={() => setPoints(section.key, [...points, newPoint()])}
                  className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  + {points.length === 0 ? 'Answer this' : 'Another'}
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label hint="when it applies — one per line">Conditions</Label>
          <textarea
            value={conditions}
            onChange={event => setConditions(event.target.value)}
            rows={3}
            placeholder={'A piece on c4/c5 to kick\nMy bishop still at home on f8'}
            className={`${INPUT} resize-y`}
          />
        </div>
      )}

      {/*
        Folded away until asked for, like the essentials were. The picker is a scrolling
        list of every line you have saved — sixty-odd of them — and most write-ups are
        not tied to an opening at all, so it was the tallest thing on a form that had
        nothing to do with it. Open from the start on a write-up that already links to
        one, so nothing is hidden.
      */}
      {openings.length > 0 &&
        (linking ? (
          <div className="flex flex-col gap-1.5">
            <Label hint="where it turns up">Openings</Label>
            <OpeningPicker
              openings={openings}
              selected={openingIds}
              onToggle={id =>
                setOpeningIds(prev =>
                  prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id],
                )
              }
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLinking(true)}
            className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            + Link to an opening
          </button>
        ))}

      {/*
        One list, and nothing in it is the "main line". A pattern is not an opening — an
        endgame idea has no main line for the rest to be variations of. They are games
        showing the same thing, and the first is first only because it was added first.
      */}
      <div className="flex flex-col gap-2">
        <Label>Examples</Label>
        {examples.map((example, index) => (
          <LineFields
            key={index}
            line={example}
            titlePlaceholder={`Example ${index + 1}`}
            onChange={next => setExamples(prev => prev.map((e, i) => (i === index ? next : e)))}
            onRemove={
              examples.length > 1
                ? () => setExamples(prev => prev.filter((_, i) => i !== index))
                : undefined
            }
          />
        ))}
        {/*
          Two buttons, because the two are not the same thing to write. A game is the
          whole score pointed at a move; a position is the one you actually have in
          front of you for most tactics, with the moves played on top of it.
        */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setExamples(prev => [...prev, emptyLine()])}
            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            + Add a game
          </button>
          <button
            type="button"
            onClick={addPosition}
            title="Start from a FEN and play the moves on top of it"
            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            + Add a position
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
        >
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Create pattern'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * One answer to one of the method's questions.
 *
 * For 3a and 3b it can carry a position: the board with that change made. That is what
 * turns a boundary from a sentence you nod at into something a drill can put in front of
 * you — "Black has an f6 Knight" is a claim about a board, and with the board stored the
 * question becomes whether the pattern still works, which is the one thing about a
 * pattern you cannot answer from having memorised its diagram.
 *
 * The FEN box is behind a press, because most points will never have one and a second
 * input on every row would make answering four questions look like filling in a form.
 */
function PointRow({
  point,
  testable,
  onText,
  onFen,
  onRemove,
}: {
  point: EssentialsPoint
  testable: boolean
  onText: (text: string) => void
  onFen: (fen: string | null) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(() => Boolean(point.fen))
  const [fen, setFen] = useState(point.fen ?? '')

  const valid = fen.trim().length === 0 || fenIsValid(fen)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-1.5">
        <textarea
          value={point.text}
          onChange={event => onText(event.target.value)}
          rows={1}
          placeholder="one point"
          className={`${INPUT} flex-1 min-w-0 resize-y`}
        />

        {testable && (
          <button
            type="button"
            onClick={() => setOpen(current => !current)}
            title={
              point.fen
                ? 'This point has a position, and is drilled'
                : 'Add the position with this change made, to drill it'
            }
            className={`shrink-0 px-2 py-2 text-xs rounded-lg border transition-colors ${
              point.fen
                ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
                : 'border-zinc-800 text-zinc-600 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {point.fen ? '▣' : '▢'}
          </button>
        )}

        <button
          type="button"
          onClick={onRemove}
          title="Remove this point"
          className="shrink-0 px-2 py-2 text-xs text-zinc-600 hover:text-red-400 transition-colors"
        >
          ✕
        </button>
      </div>

      {testable && open && (
        <div className="flex flex-col gap-1 pl-1">
          <input
            value={fen}
            onChange={event => {
              setFen(event.target.value)
              const next = event.target.value.trim()
              onFen(next.length > 0 && fenIsValid(next) ? next : null)
            }}
            placeholder="FEN of the position with this change made"
            className={`${INPUT} font-mono text-[11px]`}
          />
          {!valid && (
            <span className="text-[11px] text-red-400">
              That FEN will not read, so it is not stored yet.
            </span>
          )}
          {valid && fen.trim().length > 0 && (
            <span className="text-[11px] text-zinc-600">
              Drilled: you will be shown this board and asked whether the pattern still
              works.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

import Link from 'next/link'
import AnalyseButton from '@/components/AnalyseButton'
import StatusTag from '@/components/StatusTag'
import { ENGINE_DEPTH, isStale } from '@/lib/analysis'
import { hasReview, trainableMistakes } from '@/lib/review'
import { tagName } from '@/lib/tags'
import type { GameRecord, GameResult } from '@/types/chess'
import { SOURCE_LABEL } from '@/types/chess'

const RESULT_COLOR: Record<GameResult, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  draw: 'text-zinc-400',
}

const RESULT_LABEL: Record<GameResult, string> = {
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
}

export default function GameRow({
  userId,
  game,
  line,
  href,
}: {
  /** Whose games these are, for the analysis the row can start. */
  userId: string
  game: GameRecord
  /** Names of the saved variations this game followed, root first. Empty if none matched. */
  line: string[]
  /** The game view, carrying the current filters so Back returns to this list. */
  href: string
}) {
  const reviewed = hasReview(game)
  const tags = trainableMistakes(game.review).flatMap(mistake =>
    mistake.tags.map(id => tagName(id)),
  )
  const stale = isStale(game)

  return (
    <div className="flex items-start gap-4 px-5 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors">
      <Link href={href} className="flex items-start gap-4 flex-1 min-w-0">
        <div className="shrink-0 mt-0.5 w-12">
          <span className={`text-sm font-bold ${RESULT_COLOR[game.result]}`}>
            {RESULT_LABEL[game.result]}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 shrink-0"
              title={`You played ${game.color}`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  game.color === 'white' ? 'bg-white' : 'bg-black ring-1 ring-zinc-500'
                }`}
              />
              {game.color === 'white' ? 'White' : 'Black'}
            </span>
            <span className="text-sm text-zinc-100 truncate">
              vs {game.opponent}
              {game.opponentRating ? ` (${game.opponentRating})` : ''}
            </span>
            {game.eco && <span className="text-xs text-zinc-500">{game.eco}</span>}

            {reviewed && (
              <StatusTag
                tone="review"
                title={
                  tags.length > 0
                    ? `Reviewed — ${tags.join(', ')}`
                    : 'Reviewed — nothing tagged as trainable'
                }
              >
                ◆ reviewed
              </StatusTag>
            )}
            {/*
              Depth always, so an analysed game with nothing wrong is not mistaken for
              one the engine has never seen — and nothing at all for the absence, which
              the control on the right of the row carries instead. "no engine" used to
              sit here and said the same thing while offering nothing; two notices about
              one state, one of them inert, is one too many.
            */}
            {game.analysis ? (
              <StatusTag
                tone={stale ? 'stale' : 'engine'}
                mono
                title={
                  stale
                    ? `Analysed at depth ${game.analysis.depth} by an older build — its numbers are not comparable with depth ${ENGINE_DEPTH}, so it is left out of the accuracy and clock figures. Re-analyse to bring it back in.`
                    : `The engine has been over this game at depth ${game.analysis.depth}`
                }
              >
                ⚙ d{game.analysis.depth}
                {stale && ' · old'}
              </StatusTag>
            ) : null}

            {/* what the engine found, written plainly: a count is a measurement */}
            {game.analysis && game.analysis.blunders > 0 && (
              <span
                className="text-xs text-red-400 font-mono shrink-0"
                title={`${game.analysis.blunders} blunder${
                  game.analysis.blunders === 1 ? '' : 's'
                } at depth ${game.analysis.depth}`}
              >
                {game.analysis.blunders}??
              </span>
            )}
            {game.analysis && game.analysis.mistakes > 0 && (
              <span
                className="text-xs text-amber-400 font-mono shrink-0"
                title={`${game.analysis.mistakes} mistake${
                  game.analysis.mistakes === 1 ? '' : 's'
                } at depth ${game.analysis.depth}`}
              >
                {game.analysis.mistakes}?
              </span>
            )}
          </div>
          {line.length > 0 ? (
            <div className="text-xs text-zinc-400 mt-0.5 truncate" title="One of your saved lines">
              {line.join(' › ')}
            </div>
          ) : (
            game.openingName && (
              <div
                className="text-xs text-zinc-600 mt-0.5 truncate"
                title={`Not in a saved opening — name from ${SOURCE_LABEL[game.source]}`}
              >
                {game.openingName}
              </div>
            )
          )}
          <div className="text-xs text-zinc-600 mt-0.5">
            {new Date(game.playedAt).toLocaleDateString()} · {game.timeClass} · {game.timeControl} ·{' '}
            {SOURCE_LABEL[game.source]} · {game.termination}
          </div>
        </div>
      </Link>

      {/*
        Outside the link, because a button inside an anchor is both invalid and
        unusable — the click would navigate rather than start anything.
      */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {!game.analysis && <AnalyseButton userId={userId} game={game} />}
        <a
          href={game.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          View ↗
        </a>
      </div>
    </div>
  )
}

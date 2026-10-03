import Link from 'next/link'
import { hasReview, trainableMistakes } from '@/lib/review'
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
  game,
  line,
  href,
}: {
  game: GameRecord
  /** Names of the saved variations this game followed, root first. Empty if none matched. */
  line: string[]
  /** The game view, carrying the current filters so Back returns to this list. */
  href: string
}) {
  const reviewed = hasReview(game)
  const tags = trainableMistakes(game.review).flatMap(mistake => mistake.tags)

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
              <span
                className="text-xs text-sky-400 shrink-0"
                title={
                  tags.length > 0
                    ? `Reviewed — ${tags.join(', ')}`
                    : 'Reviewed — nothing tagged as trainable'
                }
              >
                ◆ reviewed
              </span>
            )}
            {/* depth always, so an analysed game with nothing wrong is not mistaken
                for one the engine has never seen */}
            {game.analysis ? (
              <span
                className="text-xs text-yellow-400 font-mono shrink-0"
                title={`Analysed at depth ${game.analysis.depth} — ${game.analysis.blunders} blunder${
                  game.analysis.blunders === 1 ? '' : 's'
                }, ${game.analysis.mistakes} mistake${game.analysis.mistakes === 1 ? '' : 's'}`}
              >
                ⚙ d{game.analysis.depth}
              </span>
            ) : (
              <span
                className="text-xs text-zinc-600 shrink-0"
                title="The engine has never looked at this game"
              >
                no engine
              </span>
            )}

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

      <a
        href={game.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
      >
        View ↗
      </a>
    </div>
  )
}

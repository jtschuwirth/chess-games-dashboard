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
  onToggleIgnore,
  busy,
}: {
  game: GameRecord
  onToggleIgnore: (game: GameRecord) => void
  busy: boolean
}) {
  return (
    <div
      className={`flex items-start gap-4 px-5 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors group ${
        game.ignored ? 'opacity-40' : ''
      }`}
    >
      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5 w-12">
        <span className={`text-sm font-bold ${RESULT_COLOR[game.result]}`}>
          {RESULT_LABEL[game.result]}
        </span>
        <span className="text-xs text-zinc-500" title={`Played as ${game.color}`}>
          {game.color === 'white' ? '○' : '●'}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm text-zinc-100 truncate">
            vs {game.opponent}
            {game.opponentRating ? ` (${game.opponentRating})` : ''}
          </span>
          {game.eco && <span className="text-xs text-zinc-500">{game.eco}</span>}
        </div>
        {game.openingName && (
          <div className="text-xs text-zinc-500 mt-0.5 truncate">{game.openingName}</div>
        )}
        <div className="text-xs text-zinc-600 mt-0.5">
          {new Date(game.playedAt).toLocaleDateString()} · {game.timeClass} · {game.timeControl} ·{' '}
          {SOURCE_LABEL[game.source]} · {game.termination}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <a
          href={game.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          View
        </a>
        <button
          onClick={() => onToggleIgnore(game)}
          disabled={busy}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
          title={game.ignored ? 'Put this game back in the data set' : 'Exclude this game from the stats'}
        >
          {game.ignored ? 'Restore' : 'Ignore'}
        </button>
      </div>
    </div>
  )
}

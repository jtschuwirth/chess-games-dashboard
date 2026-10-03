'use client'

import { useSyncExternalStore } from 'react'
import {
  getEngineMode,
  setEngineMode,
  subscribeEngineMode,
  type EngineMode,
} from '@/lib/engine'

const OPTIONS: { value: EngineMode; label: string; hint: string }[] = [
  {
    value: 'browser',
    label: 'this device',
    hint: 'Free and private, but it is your CPU — and a phone will suspend the tab the moment you switch app',
  },
  {
    value: 'server',
    label: 'the server',
    hint: 'Each position is sent to this deployment to be analysed, which is what makes a phone usable',
  },
]

/**
 * Where Stockfish runs. Remembered per device, because that is what the choice is
 * about: a laptop should do its own work, a phone should not.
 *
 * The choice lives in localStorage, which is exactly the "external mutable store" case
 * — prerendering cannot see it, and every toggle on the page has to agree. Hence
 * `useSyncExternalStore` rather than reading it into state on mount.
 */
export default function EngineModeToggle({ className = '' }: { className?: string }) {
  const mode = useSyncExternalStore(subscribeEngineMode, getEngineMode, () => 'browser' as const)

  return (
    <div className={`flex items-center gap-1.5 flex-wrap text-xs ${className}`}>
      <span className="text-zinc-500">Engine runs on</span>
      {OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => setEngineMode(option.value)}
          title={option.hint}
          className={`px-2.5 py-0.5 rounded-full border transition-colors ${
            mode === option.value
              ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { readFilters, writeFilters } from '@/lib/dashboard-filters'
import { backTarget, type BackTarget } from '@/lib/nav'

/**
 * Back to where you came from, rather than back to where this page was first reached.
 *
 * Every detail page had one of these written into it — `← Dashboard` on a game, `← All
 * patterns` on a write-up — which is right only when there is one way in. A game is
 * opened from the dashboard, the mistakes list, a plan's day, a pattern's examples, the
 * uploads list and a drill card, and all six said Dashboard.
 *
 * The link that opened the page says where it came from, in one `from` parameter, and
 * the fallback is what the page used to say on its own — so an old link, or one somebody
 * typed, still lands somewhere sensible.
 *
 * The filter query goes back with it for the sections that read one. Returning to the
 * dashboard with the filters cleared is not returning to the slice you left.
 */
export default function BackLink({ fallback }: { fallback: BackTarget }) {
  const params = useSearchParams()
  const search = writeFilters(readFilters(params))
  const target = backTarget(params.get('from'), fallback, search)

  return (
    <Link
      href={target.href}
      className="text-sm text-zinc-500 hover:text-zinc-300 self-start transition-colors"
    >
      ← {target.label}
    </Link>
  )
}

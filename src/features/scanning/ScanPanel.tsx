import { AlertTriangle, Check, ScanLine } from 'lucide-react'

/**
 * The thing the operator watches instead of the screen.
 *
 * The barcode gun is how these screens are really driven, and nothing said so:
 * both showed a text box reading "Type a barcode or SKU" and a Camera button,
 * so the primary input was the one input with no affordance at all. Someone new
 * to the bench would type every code by hand.
 *
 * So this states plainly that the app is listening, and then reacts — the same
 * panel becomes the confirmation, in the same place, at a size readable without
 * looking up from the carton. It also fills the dead space that made these
 * screens look unfinished.
 */

export type ScanOutcome = {
  tone: 'ok' | 'attention' | 'refused'
  title: string
  detail?: string | null
  /** The running count for this item, when there is one. */
  count?: number | null
}

const TONES = {
  ok: {
    frame: 'border-emerald-300 bg-emerald-50',
    badge: 'bg-emerald-600 text-white',
    Icon: Check,
  },
  attention: {
    frame: 'border-amber-300 bg-amber-50',
    badge: 'bg-amber-500 text-white',
    Icon: AlertTriangle,
  },
  refused: {
    frame: 'border-rose-300 bg-rose-50',
    badge: 'bg-rose-600 text-white',
    Icon: AlertTriangle,
  },
} as const

type Props = {
  /** Null until something has been scanned, which is the "ready" state. */
  outcome: ScanOutcome | null
  /** Overrides the idle copy — dispatch waits for a label, not for goods. */
  idleTitle?: string
  idleHint?: string
}

export function ScanPanel({
  outcome,
  idleTitle = 'Ready to scan',
  idleHint = 'Point the barcode gun at a label — or type the code in below.',
}: Props) {
  if (!outcome) {
    return (
      <div
        className="rounded-3xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center"
        aria-live="polite"
      >
        <ScanLine className="mx-auto mb-3 text-slate-400" size={40} strokeWidth={1.5} />
        <p className="text-xl font-bold text-slate-800">{idleTitle}</p>
        <p className="mt-1 text-base text-slate-500">{idleHint}</p>
      </div>
    )
  }

  const { frame, badge, Icon } = TONES[outcome.tone]

  return (
    <div className={`rounded-3xl border-2 px-6 py-6 transition-colors ${frame}`} aria-live="polite">
      <div className="flex items-center gap-4">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${badge}`}>
          <Icon size={24} strokeWidth={2.5} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-2xl font-bold tracking-tight text-slate-900">
            {outcome.title}
          </p>
          {outcome.detail ? (
            <p className="mt-0.5 text-base text-slate-600">{outcome.detail}</p>
          ) : null}
        </div>

        {/* The running total for this item, big enough to read at arm's length
            — the number the operator is actually keeping track of. */}
        {typeof outcome.count === 'number' && outcome.count > 0 ? (
          <p className="shrink-0 text-4xl font-black tabular-nums text-slate-900">
            ×{outcome.count}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default ScanPanel

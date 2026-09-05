import { AlertTriangle, Check, ScanLine, XCircle } from 'lucide-react'

/**
 * The scanner's status line.
 *
 * The barcode gun is how these screens are really driven, and nothing said so:
 * both showed a text box and a Camera button, so the primary input was the one
 * input with no affordance at all. This states that the reader is live, then
 * reports what it read, in the same place.
 *
 * A single row, the height of a toolbar. The earlier version was a large
 * dashed panel with a centred icon, which filled the screen with reassurance
 * and pushed the goods below the fold. Status is carried by a rule down the
 * left edge and a word, the way an instrument reads out.
 */

export type ScanOutcome = {
  tone: 'ok' | 'attention' | 'refused'
  title: string
  detail?: string | null
  /** The running count for this item, when there is one. */
  count?: number | null
}

const TONES = {
  ok: { rule: 'border-l-emerald-600', text: 'text-emerald-700', word: 'Accepted', Icon: Check },
  attention: {
    rule: 'border-l-amber-500',
    text: 'text-amber-700',
    word: 'Needs detail',
    Icon: AlertTriangle,
  },
  refused: { rule: 'border-l-rose-600', text: 'text-rose-700', word: 'Rejected', Icon: XCircle },
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
  idleTitle = 'Awaiting scan',
  idleHint = 'Scanner is live. A code can also be typed in below.',
}: Props) {
  if (!outcome) {
    return (
      <div
        className="flex items-center gap-3 border border-slate-200 border-l-4 border-l-slate-300 bg-white px-4 py-3"
        aria-live="polite"
      >
        <ScanLine size={18} className="shrink-0 text-slate-400" />

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
            {idleTitle}
          </p>
          <p className="truncate text-[13px] text-slate-500">{idleHint}</p>
        </div>

        {/* Hardware state, read the way a device reports it. */}
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 sm:flex">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
            Listening
          </span>
        </span>
      </div>
    )
  }

  const { rule, text, word, Icon } = TONES[outcome.tone]

  return (
    <div
      className={`flex items-center gap-3 border border-slate-200 border-l-4 bg-white px-4 py-3 ${rule}`}
      aria-live="polite"
    >
      <Icon size={18} className={`shrink-0 ${text}`} />

      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.09em] ${text}`}>{word}</p>
        <p className="truncate text-sm font-semibold text-slate-900">{outcome.title}</p>
        {outcome.detail ? (
          <p className="truncate font-mono text-xs text-slate-500">{outcome.detail}</p>
        ) : null}
      </div>

      {/* The running total for this item — the number the operator is keeping
          track of, and the only thing here set larger than body text. */}
      {typeof outcome.count === 'number' && outcome.count > 0 ? (
        <p className="shrink-0 text-2xl font-semibold tabular-nums text-slate-900">
          &times;{outcome.count}
        </p>
      ) : null}
    </div>
  )
}

export default ScanPanel

import { Check } from 'lucide-react'

/**
 * Where you are in a bench job, and what is left.
 *
 * Deliberately a strip, not three cards: it is chrome, not content. It sits on
 * one line under the header at the same weight as a toolbar, so the goods stay
 * the largest thing on the screen. State is carried by a rule under each
 * segment and by the numeral — one accent colour, no filled panels.
 */

export type Step = {
  /** Short enough to read at a glance across a room. */
  label: string
  /** What this stage is waiting for. Shown only while it is the current one. */
  hint?: string
}

type Props = {
  steps: Step[]
  /** 1-based. */
  current: number
}

export function StepRail({ steps, current }: Props) {
  return (
    <ol
      className="flex divide-x divide-slate-200 border-t border-slate-200 bg-white"
      aria-label={`Step ${current} of ${steps.length}`}
    >
      {steps.map((step, i) => {
        const n = i + 1
        const state = n === current ? 'current' : n < current ? 'done' : 'todo'

        return (
          <li
            key={step.label}
            aria-current={state === 'current' ? 'step' : undefined}
            className="relative flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5"
          >
            <span
              aria-hidden="true"
              className={`flex size-5 shrink-0 items-center justify-center rounded-sm text-[11px] font-semibold tabular-nums ${
                state === 'current'
                  ? 'bg-blue-600 text-white'
                  : state === 'done'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200'
              }`}
            >
              {state === 'done' ? <Check size={12} strokeWidth={3} /> : n}
            </span>

            <span className="min-w-0">
              <span
                className={`block truncate text-[11px] font-semibold uppercase tracking-[0.09em] ${
                  state === 'todo' ? 'text-slate-400' : 'text-slate-800'
                }`}
              >
                {step.label}
              </span>
              {/* Only the live step explains itself. On the others it would be
                  three lines of noise competing with the one that matters. */}
              {state === 'current' && step.hint ? (
                <span className="block truncate text-[11px] leading-tight text-slate-500">
                  {step.hint}
                </span>
              ) : null}
            </span>

            <span
              aria-hidden="true"
              className={`absolute inset-x-0 bottom-0 h-0.5 ${
                state === 'current'
                  ? 'bg-blue-600'
                  : state === 'done'
                    ? 'bg-slate-800'
                    : 'bg-transparent'
              }`}
            />
          </li>
        )
      })}
    </ol>
  )
}

export default StepRail

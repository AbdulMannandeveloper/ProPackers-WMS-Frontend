import { Check } from 'lucide-react'

/**
 * Where you are in a bench job, and what is left.
 *
 * Both goods-in and dispatch are three stages, and neither screen said so.
 * Dispatch genuinely had two steps and never showed them; receiving had four
 * implicit stages with no signposting at all. Someone new to the screen had to
 * infer the process from the controls in front of them.
 *
 * A rail rather than a wizard: the work stays on one screen, because a bench
 * operator with a carton in each hand should not be pressing Next. This only
 * tells them where they are.
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
    <ol className="flex flex-wrap items-stretch gap-2" aria-label={`Step ${current} of ${steps.length}`}>
      {steps.map((step, i) => {
        const n = i + 1
        const state = n === current ? 'current' : n < current ? 'done' : 'todo'

        return (
          <li
            key={step.label}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex min-w-[9rem] flex-1 items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors ${
              state === 'current'
                ? 'border-blue-500 bg-blue-50'
                : state === 'done'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                state === 'current'
                  ? 'bg-blue-600 text-white'
                  : state === 'done'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {state === 'done' ? <Check size={16} strokeWidth={3} /> : n}
            </span>

            <span className="min-w-0">
              <span
                className={`block text-sm font-bold ${
                  state === 'todo' ? 'text-slate-400' : 'text-slate-900'
                }`}
              >
                {step.label}
              </span>
              {/* Only the live step explains itself. On the others it would be
                  three sentences of noise competing with the one that matters. */}
              {state === 'current' && step.hint ? (
                <span className="block text-xs text-blue-700">{step.hint}</span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default StepRail

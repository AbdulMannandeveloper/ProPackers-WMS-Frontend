/**
 * Where you are in a two-step sign-in.
 *
 * The old pages swapped the password form for a code form with no indication
 * that anything had progressed, which made the second screen read as an
 * interruption rather than a step.
 */
export function AuthSteps({ current }: { current: 1 | 2 }) {
  const steps = [
    { n: 1 as const, label: 'Credentials' },
    { n: 2 as const, label: 'Verify' },
  ]

  return (
    <ol className="auth-steps" aria-label={`Step ${current} of 2`}>
      {steps.map((step) => {
        const state = step.n === current ? 'current' : step.n < current ? 'done' : 'todo'
        return (
          <li key={step.n} className={`auth-step auth-step--${state}`}>
            <span className="auth-step__dot" aria-hidden="true">
              {state === 'done' ? '✓' : step.n}
            </span>
            <span className="auth-step__label">{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

export default AuthSteps

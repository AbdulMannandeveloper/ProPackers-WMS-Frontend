const TOTAL = 2

const LABELS: Record<1 | 2, string> = {
  1: 'Your details',
  2: 'Emailed code',
}

/**
 * Where you are in a two-step sign-in.
 *
 * Deliberately quiet: a caption and a rule, not a segmented control. The role
 * switcher directly above it is already a pair of pills, and two pill rows
 * stacked read as two choices rather than one choice and one progress marker.
 */
export function AuthSteps({ current }: { current: 1 | 2 }) {
  return (
    <div className="auth-steps">
      <div className="auth-steps__caption">
        <span>
          Step {current} of {TOTAL}
        </span>
        <span className="auth-steps__label">{LABELS[current]}</span>
      </div>
      <div
        className="auth-steps__track"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={TOTAL}
        aria-label={`Step ${current} of ${TOTAL}`}
      >
        <div
          className="auth-steps__fill"
          style={{ width: `${(current / TOTAL) * 100}%` }}
        />
      </div>
    </div>
  )
}

export default AuthSteps

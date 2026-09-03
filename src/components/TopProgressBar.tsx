import { useEffect, useState } from 'react'

import { useIsLoading } from '@/lib/requests'

/**
 * A thin bar across the top of the window whenever anything is in flight.
 *
 * Fed by the counter in lib/requests, which httpClient maintains, so this covers
 * every request in the app — including the ones no button started, like the
 * token refresh or a background reload after a save.
 *
 * Two deliberate delays:
 *
 * - it waits 150ms before appearing, so a fast local request does not make the
 *   screen flash on every keystroke-triggered fetch;
 * - it lingers 200ms after the last request finishes, so back-to-back calls
 *   (save, then reload the list) read as one continuous action rather than two
 *   flickers.
 */

const APPEAR_AFTER_MS = 150
const LINGER_MS = 200

export function TopProgressBar() {
  const loading = useIsLoading()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const delay = loading ? APPEAR_AFTER_MS : LINGER_MS
    const timer = window.setTimeout(() => setVisible(loading), delay)
    return () => window.clearTimeout(timer)
  }, [loading])

  return (
    <div
      // Always mounted so the fade runs in both directions; aria-hidden because
      // the spinner on the button the user just pressed is the accessible signal.
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="h-full w-full overflow-hidden bg-primary/15">
        {/* Indeterminate: the request gives no percentage, so the bar sweeps
            rather than pretending to measure progress. */}
        <div className="progress-sweep h-full w-1/3 rounded-full bg-primary" />
      </div>
    </div>
  )
}

export default TopProgressBar

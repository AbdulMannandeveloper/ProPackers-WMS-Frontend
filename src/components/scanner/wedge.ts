/**
 * Hearing a hardware barcode gun.
 *
 * A USB or Bluetooth scanner in HID mode is a keyboard: it types the code
 * wherever the cursor happens to be and presses Enter. That is how nearly every
 * goods-in bench works, and it needs no driver, no SDK and no permission
 * prompt — which is exactly why the camera should not have been the only way in.
 *
 * The only thing separating a gun from a person is speed. A scanner emits
 * characters a few milliseconds apart; nobody types "5012345678900" in 90ms.
 * So: collect keystrokes, and on Enter decide whether the burst was machine-fast
 * and long enough to be a code.
 *
 * Getting the negative case right matters more than the positive one. If this
 * mistook typing for a scan it would swallow what someone was entering into a
 * quantity box, which is worse than not supporting guns at all.
 *
 * Written here rather than pulled in as a dependency: the whole rule is the
 * twenty lines below, and it sits naturally beside createScanDeduper.
 */

export type WedgeOptions = {
  /** Max gap between characters to still count as machine-typed. */
  maxGapMs?: number
  /** Shorter bursts are ignored; a barcode is never two characters. */
  minLength?: number
  /** Called with the decoded value. */
  onScan: (value: string) => void
}

const DEFAULT_MAX_GAP_MS = 50
// Eight, not four. Length is now the only gate at Enter, and a quick typist can
// produce four characters inside the gap window. Real barcodes are 8 or more —
// EAN-8 is the shortest in common use.
const DEFAULT_MIN_LENGTH = 8

/**
 * Whether a character arriving now still belongs to the burst before it.
 *
 * This one predicate is the entire rule. A character that fails it starts a
 * fresh burst, which means any burst that survives to Enter is machine-fast by
 * construction — so there is deliberately no second speed check at the end.
 * There used to be, and it could never fail.
 */
export const withinBurst = (
  previous: number,
  now: number,
  maxGapMs = DEFAULT_MAX_GAP_MS,
): boolean => now - previous <= maxGapMs

/**
 * Listens on the document for a gun, so nothing has to be focused.
 *
 * Returns the detach function; leaving the page must stop it capturing, or a
 * later screen would quietly receive scans meant for nobody.
 */
export const createWedgeListener = ({
  maxGapMs = DEFAULT_MAX_GAP_MS,
  minLength = DEFAULT_MIN_LENGTH,
  onScan,
}: WedgeOptions) => {
  let buffer = ''
  let times: number[] = []

  const reset = () => {
    buffer = ''
    times = []
  }

  const handle = (event: KeyboardEvent) => {
    // Modifier combinations are shortcuts, not stock.
    if (event.ctrlKey || event.metaKey || event.altKey) {
      reset()
      return
    }

    if (event.key === 'Enter') {
      const value = buffer
      reset()

      // Length is the only thing left to check: see withinBurst.
      if (value.length >= minLength) {
        // Only now claim the event: a person pressing Enter in a form must
        // still submit it.
        event.preventDefault()
        onScan(value)
      }
      return
    }

    // Printable characters only. Tab, arrows and the rest end a burst rather
    // than joining it.
    if (event.key.length !== 1) {
      reset()
      return
    }

    // Date.now() rather than event.timeStamp, and never a mix of the two: a
    // trusted event's timeStamp is milliseconds since page load, Date.now() is
    // milliseconds since 1970. Falling back from one to the other would put a
    // gap of about 1.7e12 between two adjacent keystrokes.
    const now = Date.now()

    // A slow character means whatever came before was not one scan. Start
    // again from here rather than discarding it, so a gun firing immediately
    // after someone stopped typing is still caught.
    if (times.length > 0 && !withinBurst(times[times.length - 1], now, maxGapMs)) {
      buffer = ''
      times = []
    }

    buffer += event.key
    times.push(now)
  }

  document.addEventListener('keydown', handle, true)

  return () => document.removeEventListener('keydown', handle, true)
}

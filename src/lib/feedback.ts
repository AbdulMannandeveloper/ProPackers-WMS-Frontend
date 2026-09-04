/**
 * Telling the operator what happened without making them look.
 *
 * On a goods-in bench the eyes are on the carton, not the screen. A scan that
 * only draws a row somewhere makes the operator glance up to check every single
 * time, which is most of what made the old flow feel slow.
 *
 * Vibration carries better than sound in a loud warehouse, so both fire
 * together and either alone is enough to tell the three outcomes apart.
 *
 * Tones are generated rather than shipped as files: three short beeps are not
 * worth three network requests, and an oscillator cannot 404.
 */

const MUTE_KEY = 'propackers.receiving.muted'

export type FeedbackKind = 'accepted' | 'attention' | 'refused'

/** Frequency in Hz and duration in ms, per outcome. */
const TONES: Record<FeedbackKind, Array<[number, number]>> = {
  // Short and bright: the sound of a carton counted.
  accepted: [[1_040, 70]],
  // Lower and longer, so it is obviously not an accept.
  attention: [[620, 130]],
  // Two low notes. Distinct even when half heard.
  refused: [
    [380, 110],
    [300, 150],
  ],
}

const VIBRATIONS: Record<FeedbackKind, number | number[]> = {
  accepted: 40,
  attention: [40, 60, 40],
  refused: 220,
}

let context: AudioContext | null = null

/**
 * One AudioContext for the session.
 *
 * Browsers cap how many can exist, and creating one per beep would run a bench
 * out within a shift.
 */
const audioContext = (): AudioContext | null => {
  if (context) return context
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
    return context
  } catch {
    // Blocked, unsupported, or out of contexts. Silence is acceptable;
    // throwing here would break the scan it was meant to confirm.
    return null
  }
}

export const isMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    // Private windows and blocked site data both throw on access.
    return false
  }
}

export const setMuted = (muted: boolean): void => {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Not remembering the preference is survivable; crashing is not.
  }
}

const playTone = (ctx: AudioContext, frequency: number, ms: number, startAt: number) => {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = 'square'
  oscillator.frequency.value = frequency

  // A square wave switched on and off clicks. Ramping the gain instead gives
  // the short blip a scanner makes rather than a pop.
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + ms / 1000)

  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + ms / 1000 + 0.02)
}

/**
 * Signals an outcome. Never throws, and does nothing when muted.
 *
 * Every call is guarded: audio needs a user gesture in some browsers, vibration
 * is absent on desktop and refused in some embedded views. Feedback that breaks
 * the flow it was meant to help is worse than no feedback.
 */
export const signal = (kind: FeedbackKind): void => {
  if (isMuted()) return

  const ctx = audioContext()
  if (ctx) {
    try {
      // Autoplay policy suspends a context created before any interaction.
      if (ctx.state === 'suspended') void ctx.resume()

      let at = ctx.currentTime
      for (const [frequency, ms] of TONES[kind]) {
        playTone(ctx, frequency, ms, at)
        at += ms / 1000 + 0.04
      }
    } catch {
      // ignore
    }
  }

  try {
    navigator.vibrate?.(VIBRATIONS[kind])
  } catch {
    // ignore
  }
}

/** Test seam: drops the cached context so a fresh one is built. */
export const resetAudioForTests = () => {
  context = null
}

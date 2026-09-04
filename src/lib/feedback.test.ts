/**
 * Scan feedback.
 *
 * The behaviour worth pinning is not that it makes a noise — it is that it
 * never gets in the way. Audio needs a user gesture in some browsers, vibration
 * does not exist on desktop, and localStorage throws outright in a private
 * window. Any of those escaping as an exception would break the scan the sound
 * was meant to confirm, which is a far worse outcome than silence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { signal, isMuted, setMuted, resetAudioForTests } from './feedback'

/** A believable AudioContext, recording what was asked of it. */
const fakeAudio = () => {
  const started: number[] = []
  const oscillator = {
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn((t: number) => started.push(t)),
    stop: vi.fn(),
  }
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
  }
  return { ctx, oscillator, started }
}

/**
 * A constructor, not an arrow function: `new` on an arrow throws, which would
 * make every one of these tests pass for the wrong reason — the code would be
 * falling back to silence rather than being exercised.
 */
const asConstructor = (ctx: unknown) =>
  vi.fn(function (this: unknown) {
    return ctx
  })

let vibrate: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetAudioForTests()
  localStorage.clear()
  vibrate = vi.fn()
  Object.defineProperty(navigator, 'vibrate', {
    value: vibrate,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signalling an outcome', () => {
  it('makes a sound and a buzz when a carton is counted', () => {
    const { ctx } = fakeAudio()
    vi.stubGlobal('AudioContext', asConstructor(ctx))

    signal('accepted')

    expect(ctx.createOscillator).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('gives refusal two notes, so it is not mistaken for an accept', () => {
    // Half heard across a warehouse, one note versus two is the difference
    // that carries.
    const { ctx } = fakeAudio()
    vi.stubGlobal('AudioContext', asConstructor(ctx))

    signal('refused')

    expect(ctx.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('gives the three outcomes different vibrations', () => {
    const { ctx } = fakeAudio()
    vi.stubGlobal('AudioContext', asConstructor(ctx))

    signal('accepted')
    signal('attention')
    signal('refused')

    const patterns = vibrate.mock.calls.map((c) => JSON.stringify(c[0]))
    expect(new Set(patterns).size).toBe(3)
  })

  it('reuses one AudioContext rather than one per beep', () => {
    // Browsers cap how many can exist; a bench would run out within a shift.
    const { ctx } = fakeAudio()
    const Ctor = asConstructor(ctx)
    vi.stubGlobal('AudioContext', Ctor)

    signal('accepted')
    signal('accepted')
    signal('accepted')

    expect(Ctor).toHaveBeenCalledTimes(1)
  })

  it('resumes a context the autoplay policy suspended', () => {
    const { ctx } = fakeAudio()
    ctx.state = 'suspended'
    vi.stubGlobal('AudioContext', asConstructor(ctx))

    signal('accepted')

    expect(ctx.resume).toHaveBeenCalled()
  })
})

describe('muting', () => {
  it('silences both the sound and the buzz', () => {
    const { ctx } = fakeAudio()
    vi.stubGlobal('AudioContext', asConstructor(ctx))

    setMuted(true)
    signal('accepted')

    expect(ctx.createOscillator).not.toHaveBeenCalled()
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('is remembered, so a bench stays quiet across reloads', () => {
    setMuted(true)
    expect(isMuted()).toBe(true)

    setMuted(false)
    expect(isMuted()).toBe(false)
  })

  it('defaults to making a noise', () => {
    expect(isMuted()).toBe(false)
  })

  it('survives storage being unavailable', () => {
    // A private window throws on access rather than returning null.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(() => setMuted(true)).not.toThrow()
    expect(isMuted()).toBe(false)

    getItem.mockRestore()
    setItem.mockRestore()
  })
})

describe('when the platform cannot oblige', () => {
  it('says nothing rather than throwing when there is no AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)

    expect(() => signal('accepted')).not.toThrow()
    // The buzz still fires; losing one channel must not lose the other.
    expect(vibrate).toHaveBeenCalled()
  })

  it('survives an AudioContext that refuses to construct', () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        throw new Error('not allowed')
      }),
    )

    expect(() => signal('accepted')).not.toThrow()
  })

  it('survives a desktop with no vibration', () => {
    const { ctx } = fakeAudio()
    vi.stubGlobal('AudioContext', asConstructor(ctx))
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })

    expect(() => signal('accepted')).not.toThrow()
    expect(ctx.createOscillator).toHaveBeenCalled()
  })

  it('survives vibration being refused', () => {
    const { ctx } = fakeAudio()
    vi.stubGlobal('AudioContext', asConstructor(ctx))
    Object.defineProperty(navigator, 'vibrate', {
      value: () => {
        throw new Error('blocked')
      },
      configurable: true,
    })

    expect(() => signal('accepted')).not.toThrow()
  })
})

/**
 * Telling a barcode gun apart from a person.
 *
 * The failing-safe direction is the important one. A missed scan is an
 * annoyance — the operator scans again, or types the code. Mistaking typing for
 * a scan would steal what someone was entering into the quantity box and fire a
 * lookup for it, which makes the screen unusable rather than merely imperfect.
 *
 * So most of these are about what must NOT trigger.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

import { createWedgeListener, withinBurst } from './wedge'

describe('whether a character belongs to the burst before it', () => {
  it('accepts characters a few milliseconds apart', () => {
    // A scanner emits a whole code in well under a tenth of a second.
    expect(withinBurst(1000, 1008)).toBe(true)
  })

  it('rejects a human-speed gap', () => {
    // 120ms between keys is brisk for a person and glacial for a scanner.
    expect(withinBurst(1000, 1120)).toBe(false)
  })

  it('treats the threshold itself as inside the burst', () => {
    expect(withinBurst(1000, 1050, 50)).toBe(true)
    expect(withinBurst(1000, 1051, 50)).toBe(false)
  })
})

describe('listening for a gun', () => {
  let detach: (() => void) | null = null

  afterEach(() => {
    detach?.()
    detach = null
  })

  /** Fires keys `gap` ms apart, as a scanner or a person would. */
  const type = (text: string, gap: number, { enter = true } = {}) => {
    let t = 1000
    for (const ch of text) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }),
      )
      // jsdom does not advance timeStamp, so drive it directly.
      t += gap
      vi.setSystemTime(t)
    }
    if (enter) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
    }
  }

  it('fires for a fast burst ending in Enter, with nothing focused', () => {
    // The whole point: the operator points the gun and it lands, without
    // having clicked into a field first.
    vi.useFakeTimers()
    const onScan = vi.fn()
    detach = createWedgeListener({ onScan })

    type('5012345678900', 8)

    expect(onScan).toHaveBeenCalledWith('5012345678900')
    vi.useRealTimers()
  })

  it('stays out of the way when a person types', () => {
    // Deliberately longer than the minimum length, so the only thing that can
    // reject it is the speed rule. A short string would pass this test for the
    // wrong reason.
    vi.useFakeTimers()
    const onScan = vi.fn()
    detach = createWedgeListener({ onScan })

    type('THIS-IS-TYPED-BY-A-PERSON', 150)

    expect(onScan).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('ignores a short word typed quickly', () => {
    // A fast typist can put four characters inside the gap window, which is
    // why the minimum is a barcode length rather than four.
    vi.useFakeTimers()
    const onScan = vi.fn()
    detach = createWedgeListener({ onScan })

    type('done', 20)

    expect(onScan).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('ignores a burst too short to be a barcode', () => {
    vi.useFakeTimers()
    const onScan = vi.fn()
    detach = createWedgeListener({ onScan })

    type('12', 8)

    expect(onScan).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('ignores a fast burst that never ends in Enter', () => {
    vi.useFakeTimers()
    const onScan = vi.fn()
    detach = createWedgeListener({ onScan })

    type('5012345678900', 8, { enter: false })

    expect(onScan).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('ignores a keyboard shortcut', () => {
    const onScan = vi.fn()
    detach = createWedgeListener({ onScan })

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }),
    )
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onScan).not.toHaveBeenCalled()
  })

  it('starts a fresh burst when a gun fires straight after typing', () => {
    // Someone finishes typing a note, then scans. The scan must not be
    // poisoned by the characters before it.
    vi.useFakeTimers()
    const onScan = vi.fn()
    detach = createWedgeListener({ onScan })

    type('note', 200, { enter: false })
    type('5012345678900', 8)

    expect(onScan).toHaveBeenCalledWith('5012345678900')
    vi.useRealTimers()
  })

  it('stops capturing once detached', () => {
    // Leaving the page must not leave a listener eating scans for a screen
    // that is no longer there.
    vi.useFakeTimers()
    const onScan = vi.fn()
    const stop = createWedgeListener({ onScan })
    stop()

    type('5012345678900', 8)

    expect(onScan).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

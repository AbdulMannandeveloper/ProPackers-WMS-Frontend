/**
 * Reading a barcode out of a captured still.
 *
 * The live loop decodes the preview stream, which the browser scales down and
 * which smears when a handheld phone moves. A capture takes one frame at the
 * track's own resolution with nothing moving — more pixels across the bars and
 * no blur, which is usually the whole difference on a curved or glared label.
 *
 * What can be tested here is the part that decides how big the frame is and
 * which decoder reads it. Whether a real camera actually does better on a real
 * label needs a real camera, and is in docs/QA-CHECKLIST.md.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

import { decodeFromCanvas, frameSize, isFrameReady } from './engine'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('frameSize', () => {
  it('uses the track resolution, not the CSS box', () => {
    // The reason capture works at all. A phone paints a 1920x1080 track into a
    // box a few hundred pixels wide; capturing at that size would throw away
    // most of the detail the decode needs.
    expect(frameSize({ videoWidth: 1920, videoHeight: 1080 })).toEqual({
      width: 1920,
      height: 1080,
    })
  })

  it('floors fractional dimensions, since a canvas cannot hold half a pixel', () => {
    expect(frameSize({ videoWidth: 640.7, videoHeight: 480.2 })).toEqual({
      width: 640,
      height: 480,
    })
  })

  it('reports zero before the first frame arrives', () => {
    expect(frameSize({})).toEqual({ width: 0, height: 0 })
    expect(frameSize({ videoWidth: 0, videoHeight: 0 })).toEqual({ width: 0, height: 0 })
  })
})

describe('isFrameReady', () => {
  it('is true once the track reports a size', () => {
    expect(isFrameReady({ videoWidth: 1280, videoHeight: 720 })).toBe(true)
  })

  it('is false before then, so a capture is refused rather than blank', () => {
    // Capturing at 0x0 would produce an empty canvas, decode to nothing, and
    // tell the operator there was no barcode — blaming the label for a race.
    expect(isFrameReady({})).toBe(false)
    expect(isFrameReady({ videoWidth: 0, videoHeight: 480 })).toBe(false)
  })
})

describe('decodeFromCanvas with the native detector', () => {
  const canvas = {} as HTMLCanvasElement

  it('reads a barcode out of the frame', async () => {
    const detector = { detect: vi.fn().mockResolvedValue([{ rawValue: '5012345678900' }]) }

    await expect(decodeFromCanvas('native', canvas, detector)).resolves.toEqual({
      found: true,
      value: '5012345678900',
    })
    expect(detector.detect).toHaveBeenCalledWith(canvas)
  })

  it('reuses the detector it was given rather than building another', async () => {
    // Constructing one per shot re-negotiates formats every time.
    const detector = { detect: vi.fn().mockResolvedValue([{ rawValue: 'ABC' }]) }

    await decodeFromCanvas('native', canvas, detector)
    await decodeFromCanvas('native', canvas, detector)

    expect(detector.detect).toHaveBeenCalledTimes(2)
  })

  it('reports "no code" for an empty result, rather than throwing', async () => {
    // A blurred photo is the ordinary outcome, not a fault.
    const detector = { detect: vi.fn().mockResolvedValue([]) }

    await expect(decodeFromCanvas('native', canvas, detector)).resolves.toEqual({
      found: false,
      reason: 'no-code',
    })
  })

  it('reports "no code" when the detector returns a blank value', async () => {
    const detector = { detect: vi.fn().mockResolvedValue([{ rawValue: '' }]) }

    await expect(decodeFromCanvas('native', canvas, detector)).resolves.toMatchObject({
      found: false,
      reason: 'no-code',
    })
  })

  it('surfaces a genuine failure as an error, not as a missing barcode', async () => {
    // Telling an operator there was no barcode when the decoder actually broke
    // sends them hunting for a better angle on a problem that is not theirs.
    const detector = { detect: vi.fn().mockRejectedValue(new Error('detector exploded')) }

    await expect(decodeFromCanvas('native', canvas, detector)).resolves.toMatchObject({
      found: false,
      reason: 'error',
      detail: 'detector exploded',
    })
  })
})

describe('decodeFromCanvas falling back to zxing', () => {
  const canvas = {} as HTMLCanvasElement

  const mockZxing = (impl: () => unknown) => {
    vi.doMock('@zxing/browser', () => ({
      BrowserMultiFormatReader: class {
        decodeFromCanvas = impl
      },
    }))
  }

  it('is used when the engine is zxing', async () => {
    mockZxing(() => ({ getText: () => 'CODE128VALUE' }))
    const { decodeFromCanvas: decode } = await import('./engine')

    await expect(decode('zxing', canvas)).resolves.toEqual({
      found: true,
      value: 'CODE128VALUE',
    })
  })

  it('is used when the engine is native but no detector was supplied', async () => {
    // Otherwise a capture would silently do nothing on that path.
    mockZxing(() => ({ getText: () => 'FALLBACK' }))
    const { decodeFromCanvas: decode } = await import('./engine')

    await expect(decode('native', canvas)).resolves.toEqual({
      found: true,
      value: 'FALLBACK',
    })
  })

  it('treats NotFoundException as "no code", not as an error', async () => {
    // zxing throws rather than returning null when an image holds no barcode,
    // which is the single most common outcome of pressing Capture.
    mockZxing(() => {
      const err = new Error('no barcode')
      err.name = 'NotFoundException'
      throw err
    })
    const { decodeFromCanvas: decode } = await import('./engine')

    await expect(decode('zxing', canvas)).resolves.toEqual({
      found: false,
      reason: 'no-code',
    })
  })

  it('still reports a real failure as an error', async () => {
    mockZxing(() => {
      throw new Error('canvas is tainted')
    })
    const { decodeFromCanvas: decode } = await import('./engine')

    await expect(decode('zxing', canvas)).resolves.toMatchObject({
      found: false,
      reason: 'error',
    })
  })
})

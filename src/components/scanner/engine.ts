/**
 * Which decoder to use, and how to stop the same label firing fifty times.
 *
 * Two engines:
 *  - the native BarcodeDetector where it exists and covers our formats. It is
 *    hardware accelerated and noticeably faster on a phone.
 *  - @zxing/browser everywhere else (Safari, Firefox). WebAssembly, slower, works.
 */

export const BARCODE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'qr_code',
] as const

export type ScannerEngine = 'native' | 'zxing'

type DetectorCtor = {
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * Presence of BarcodeDetector does not guarantee format coverage — some builds
 * ship it supporting only qr_code, which would silently fail to read the
 * EAN/Code-128 labels a warehouse actually uses. Check before committing to it.
 */
export const chooseEngine = async (
  win: { BarcodeDetector?: DetectorCtor } = window as never,
): Promise<ScannerEngine> => {
  const Detector = win.BarcodeDetector
  if (!Detector) return 'zxing'

  try {
    const supported = await Detector.getSupportedFormats?.()
    if (!supported || supported.length === 0) return 'zxing'

    // Needs the 1D retail/logistics formats, not just QR.
    const essential = ['ean_13', 'code_128']
    return essential.every((f) => supported.includes(f)) ? 'native' : 'zxing'
  } catch {
    return 'zxing'
  }
}

/** Formats the native detector supports, intersected with the ones we want. */
export const negotiateFormats = async (
  win: { BarcodeDetector?: DetectorCtor } = window as never,
): Promise<string[]> => {
  try {
    const supported = await win.BarcodeDetector?.getSupportedFormats?.()
    if (!supported) return [...BARCODE_FORMATS]
    return BARCODE_FORMATS.filter((f) => supported.includes(f))
  } catch {
    return [...BARCODE_FORMATS]
  }
}

/**
 * The true pixel size of the video frame.
 *
 * videoWidth/videoHeight are the track's own resolution; clientWidth/Height are
 * whatever CSS box it happens to be painted into, which on a phone is usually
 * much smaller. Capturing at the CSS size would throw away most of the pixels
 * across the bars — which is the entire reason a still decodes where the live
 * preview does not.
 *
 * Zero until the first frame arrives, so a capture before the camera is ready
 * has to be refused rather than silently producing an empty canvas.
 */
export const frameSize = (video: {
  videoWidth?: number
  videoHeight?: number
}): { width: number; height: number } => ({
  width: Math.floor(video?.videoWidth ?? 0),
  height: Math.floor(video?.videoHeight ?? 0),
})

export const isFrameReady = (video: { videoWidth?: number; videoHeight?: number }) => {
  const { width, height } = frameSize(video)
  return width > 0 && height > 0
}

export type CaptureOutcome =
  | { found: true; value: string }
  | { found: false; reason: 'no-code' | 'not-ready' | 'error'; detail?: string }

/**
 * Reads a barcode out of a still frame, using the same engine the live loop
 * chose.
 *
 * Deliberately the same engine: a device that scans live with the native
 * detector but falls back to zxing for stills would succeed and fail for
 * reasons no operator could ever explain.
 *
 * `detector` is the already-constructed native BarcodeDetector when the engine
 * is native — reusing it avoids re-negotiating formats on every shot.
 */
export const decodeFromCanvas = async (
  engine: ScannerEngine,
  canvas: HTMLCanvasElement,
  detector?: { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> },
): Promise<CaptureOutcome> => {
  try {
    if (engine === 'native' && detector) {
      const results = await detector.detect(canvas)
      const value = results?.[0]?.rawValue
      return value ? { found: true, value } : { found: false, reason: 'no-code' }
    }

    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    const result = reader.decodeFromCanvas(canvas)
    const value = result?.getText?.()
    return value ? { found: true, value } : { found: false, reason: 'no-code' }
  } catch (err) {
    // zxing throws NotFoundException rather than returning null when the image
    // holds no barcode. That is the ordinary outcome of a blurred photo, not a
    // fault, so it must not surface as an error.
    const name = (err as { name?: string })?.name ?? ''
    if (/NotFound/i.test(name)) return { found: false, reason: 'no-code' }
    return {
      found: false,
      reason: 'error',
      detail: (err as Error)?.message,
    }
  }
}

/**
 * A barcode sits in frame for many frames, so a naive handler fires a lookup per
 * frame. This suppresses a repeat of the same value for `windowMs`, while
 * letting a different code through immediately — scanning two labels in quick
 * succession is normal on a goods-in bench.
 */
export const createScanDeduper = (windowMs = 1500) => {
  let lastValue: string | null = null
  let lastAt = 0

  return {
    /** True when this read should be acted on. */
    accept(value: string, now: number = Date.now()): boolean {
      if (value === lastValue && now - lastAt < windowMs) return false
      lastValue = value
      lastAt = now
      return true
    },
    reset() {
      lastValue = null
      lastAt = 0
    },
  }
}

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

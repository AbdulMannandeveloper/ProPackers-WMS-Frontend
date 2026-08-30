/**
 * The parts of the scanner that can be tested without a camera.
 *
 * Deliberately narrow: stream acquisition, the decode loop and the permission
 * states need a real browser and a real device, and are verified by hand. What
 * is covered here is the logic that decides *which* camera, *which* engine, and
 * whether a read should be acted on — the parts most likely to be wrong in a way
 * a person would not notice.
 */

import { describe, it, expect } from 'vitest'

import { pickPreferredCamera, type CameraDevice } from './cameras'
import { chooseEngine, createScanDeduper, negotiateFormats } from './engine'

const cam = (deviceId: string, label: string): CameraDevice => ({ deviceId, label })

describe('pickPreferredCamera', () => {
  it('returns null when there is no camera', () => {
    expect(pickPreferredCamera([], null)).toBeNull()
  })

  it('prefers a rear camera — the front one cannot see a shelf label', () => {
    const devices = [cam('a', 'Front Camera'), cam('b', 'Back Camera')]
    expect(pickPreferredCamera(devices, null)?.deviceId).toBe('b')
  })

  it('recognises rear cameras by several vendor spellings', () => {
    for (const label of ['Rear Camera', 'camera2 0, facing environment', 'World Facing']) {
      const devices = [cam('front', 'Front Camera'), cam('rear', label)]
      expect(pickPreferredCamera(devices, null)?.deviceId).toBe('rear')
    }
  })

  it('honours a camera the operator chose before, over the rear default', () => {
    const devices = [cam('a', 'Front Camera'), cam('b', 'Back Camera')]
    expect(pickPreferredCamera(devices, 'a')?.deviceId).toBe('a')
  })

  it('ignores a remembered camera that is no longer plugged in', () => {
    const devices = [cam('b', 'Back Camera')]
    expect(pickPreferredCamera(devices, 'unplugged')?.deviceId).toBe('b')
  })

  it('avoids the front camera when no label says "back"', () => {
    const devices = [cam('a', 'Front Camera'), cam('b', 'USB Webcam')]
    expect(pickPreferredCamera(devices, null)?.deviceId).toBe('b')
  })

  it('falls back to the first device when labels are empty', () => {
    // What actually happens on a first visit: enumerateDevices returns blank
    // labels until permission is granted.
    const devices = [cam('a', ''), cam('b', '')]
    expect(pickPreferredCamera(devices, null)?.deviceId).toBe('a')
  })
})

describe('chooseEngine', () => {
  it('falls back to zxing when BarcodeDetector is absent', async () => {
    await expect(chooseEngine({})).resolves.toBe('zxing')
  })

  it('uses the native detector when it covers the 1D formats we need', async () => {
    const win = {
      BarcodeDetector: {
        getSupportedFormats: async () => ['ean_13', 'code_128', 'qr_code'],
      },
    }
    await expect(chooseEngine(win)).resolves.toBe('native')
  })

  it('rejects a native detector that only does QR', async () => {
    // Some builds ship BarcodeDetector supporting qr_code alone. Trusting mere
    // presence would silently fail to read the EAN and Code-128 labels a
    // warehouse actually uses.
    const win = { BarcodeDetector: { getSupportedFormats: async () => ['qr_code'] } }
    await expect(chooseEngine(win)).resolves.toBe('zxing')
  })

  it('falls back when the format query throws', async () => {
    const win = {
      BarcodeDetector: {
        getSupportedFormats: async () => {
          throw new Error('not implemented')
        },
      },
    }
    await expect(chooseEngine(win)).resolves.toBe('zxing')
  })

  it('negotiates down to the intersection of wanted and supported formats', async () => {
    const win = {
      BarcodeDetector: {
        getSupportedFormats: async () => ['ean_13', 'code_128', 'pdf417'],
      },
    }
    await expect(negotiateFormats(win)).resolves.toEqual(['ean_13', 'code_128'])
  })
})

describe('createScanDeduper', () => {
  it('accepts the first read', () => {
    const d = createScanDeduper(1500)
    expect(d.accept('5012345678900', 1000)).toBe(true)
  })

  it('suppresses the same code within the window', () => {
    // A label sits in frame for many frames; without this one scan would raise
    // dozens of lookups.
    const d = createScanDeduper(1500)
    d.accept('5012345678900', 1000)
    expect(d.accept('5012345678900', 1400)).toBe(false)
    expect(d.accept('5012345678900', 2400)).toBe(false)
  })

  it('accepts the same code again once the window has passed', () => {
    const d = createScanDeduper(1500)
    d.accept('5012345678900', 1000)
    expect(d.accept('5012345678900', 2600)).toBe(true)
  })

  it('lets a different code through immediately', () => {
    // Scanning two labels back to back is normal on a goods-in bench.
    const d = createScanDeduper(1500)
    d.accept('5012345678900', 1000)
    expect(d.accept('5099999999999', 1050)).toBe(true)
  })

  it('forgets everything on reset', () => {
    const d = createScanDeduper(1500)
    d.accept('5012345678900', 1000)
    d.reset()
    expect(d.accept('5012345678900', 1100)).toBe(true)
  })
})

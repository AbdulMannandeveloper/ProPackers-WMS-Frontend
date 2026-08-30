/**
 * Camera selection.
 *
 * Kept free of React and of the media stream itself so the choosing logic can be
 * tested — the streaming parts around it cannot meaningfully be.
 */

export type CameraDevice = {
  deviceId: string
  label: string
}

const REMEMBERED_KEY = 'propackers.scanner.cameraId'

/** Rear-facing on a phone. Labels vary by vendor, so match several spellings. */
const REAR_HINTS = /\b(back|rear|environment|world|trasera|arri[eè]re)\b/i
const FRONT_HINTS = /\b(front|user|face|selfie)\b/i

/**
 * Picks which camera to open.
 *
 * Order: a camera the operator explicitly chose before, then a rear-facing one
 * (a front camera is useless against a shelf label), then whatever is first.
 *
 * `enumerateDevices()` returns empty labels until permission has been granted,
 * so on a first run this usually falls through to the last rule — which is
 * correct, because `facingMode: 'environment'` in the constraints has already
 * asked the browser for the rear camera by then.
 */
export const pickPreferredCamera = (
  devices: CameraDevice[],
  rememberedId?: string | null,
): CameraDevice | null => {
  if (devices.length === 0) return null

  if (rememberedId) {
    const remembered = devices.find((d) => d.deviceId === rememberedId)
    if (remembered) return remembered
  }

  const rear = devices.find((d) => REAR_HINTS.test(d.label))
  if (rear) return rear

  // Prefer anything that is not explicitly the front camera.
  const notFront = devices.find((d) => !FRONT_HINTS.test(d.label))
  return notFront ?? devices[0]
}

/** localStorage throws in some privacy modes; a remembered camera is a nicety. */
export const readRememberedCamera = (): string | null => {
  try {
    return window.localStorage.getItem(REMEMBERED_KEY)
  } catch {
    return null
  }
}

export const rememberCamera = (deviceId: string): void => {
  try {
    window.localStorage.setItem(REMEMBERED_KEY, deviceId)
  } catch {
    // Not worth surfacing — the scanner works, it just forgets.
  }
}

export const listCameras = async (): Promise<CameraDevice[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
    }))
}

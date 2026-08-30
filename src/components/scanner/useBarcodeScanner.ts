import { useCallback, useEffect, useRef, useState } from 'react'

import {
  listCameras,
  pickPreferredCamera,
  readRememberedCamera,
  rememberCamera,
  type CameraDevice,
} from './cameras'
import {
  chooseEngine,
  createScanDeduper,
  decodeFromCanvas,
  frameSize,
  isFrameReady,
  negotiateFormats,
  type CaptureOutcome,
  type ScannerEngine,
} from './engine'

/**
 * Owns the camera stream and the decode loop.
 *
 * The states below are deliberately distinct rather than one generic "error".
 * A scanner that dead-ends is worse than no scanner, so each failure needs to
 * tell the operator what to do about it — and several of them are routine
 * rather than exceptional (a desk machine with no webcam, a damaged label).
 */
export type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'insecure-context' // not HTTPS — getUserMedia is unavailable
  | 'no-camera' // no video input on this machine
  | 'permission-denied'
  | 'camera-busy' // another application holds it
  | 'failed'

type Options = {
  active: boolean
  onScan: (value: string) => void
  /** Keep decoding after a hit — the goods-in bench scans continuously. */
  continuous?: boolean
}

export const useBarcodeScanner = ({ active, onScan, continuous = false }: Options) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const stopFnRef = useRef<(() => void) | null>(null)
  const rafRef = useRef<number | null>(null)
  const deduperRef = useRef(createScanDeduper())
  // Held in a ref so the decode loop never closes over a stale callback.
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [engine, setEngine] = useState<ScannerEngine | null>(null)
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [cameraId, setCameraId] = useState<string | null>(null)
  // Bumped by selectCamera. cameraId is written *by* the effect, so it must not
  // also be an input to it, or every start restarts the stream a second time.
  const [restartToken, setRestartToken] = useState(0)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [capturing, setCapturing] = useState(false)

  // The native detector built by the live loop, reused for stills so a capture
  // does not re-negotiate formats on every shot.
  const detectorRef = useRef<{
    detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>
  } | null>(null)

  // While a captured frame is being reviewed the live loop must not keep
  // decoding: two decoders on one track is how a stale value fires after the
  // operator has already moved on to the next label.
  const pausedRef = useRef(false)
  const [detail, setDetail] = useState<string | null>(null)

  /** Releases the camera. Leaving a track live keeps the indicator light on. */
  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    stopFnRef.current?.()
    stopFnRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setTorchOn(false)
    setTorchAvailable(false)
  }, [])

  const handleHit = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      if (!deduperRef.current.accept(trimmed)) return

      // Confirm the read without the operator having to look at the screen.
      try {
        navigator.vibrate?.(60)
      } catch {
        /* not supported */
      }

      onScanRef.current(trimmed)
      if (!continuous) teardown()
    },
    [continuous, teardown],
  )

  useEffect(() => {
    if (!active) {
      teardown()
      setStatus('idle')
      return
    }

    let cancelled = false

    const start = async () => {
      setDetail(null)
      setStatus('starting')

      // getUserMedia needs a secure context. localhost is exempt; a LAN IP is
      // not, which is what bites on a staging box served over plain HTTP.
      if (!window.isSecureContext) {
        setStatus('insecure-context')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('no-camera')
        return
      }

      // Ask about permission before prompting, so a previously-denied camera
      // explains itself instead of appearing to hang waiting for a prompt that
      // will never show.
      try {
        const perm = await navigator.permissions?.query({
          name: 'camera' as PermissionName,
        })
        if (perm?.state === 'denied') {
          setStatus('permission-denied')
          return
        }
      } catch {
        // Firefox has no camera permission descriptor; fall through and prompt.
      }

      let stream: MediaStream
      try {
        // On a repeat visit permission is already granted, so enumerateDevices
        // returns real labels and we can pick deliberately — a phone often
        // exposes several rear cameras and facingMode may land on an
        // ultra-wide, which will not focus on a label held close.
        //
        // On a first visit labels are empty, pickPreferredCamera returns
        // nothing useful, and facingMode does the asking instead.
        const remembered = readRememberedCamera()
        const known = await listCameras()
        const preferred = pickPreferredCamera(
          known.filter((d) => d.deviceId),
          remembered,
        )
        const targetId =
          remembered ?? (preferred && preferred.label ? preferred.deviceId : null)

        stream = await navigator.mediaDevices.getUserMedia({
          video: targetId
            ? { deviceId: { exact: targetId } }
            : // Rear camera on a phone; ignored on a laptop.
              { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch (err) {
        const name = (err as DOMException)?.name
        if (cancelled) return
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('permission-denied')
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          // A remembered camera that has since been unplugged lands here.
          setStatus('no-camera')
        } else if (name === 'NotReadableError' || name === 'AbortError') {
          setStatus('camera-busy')
        } else {
          setDetail((err as Error)?.message ?? null)
          setStatus('failed')
        }
        return
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.setAttribute('playsinline', 'true') // iOS refuses fullscreen takeover
        try {
          await video.play()
        } catch {
          /* autoplay policies; the frames still arrive */
        }
      }

      // Labels are only populated once permission is granted, which is why this
      // runs after getUserMedia rather than before.
      const devices = await listCameras()
      if (!cancelled) {
        setCameras(devices)
        const activeDeviceId =
          stream.getVideoTracks()[0]?.getSettings().deviceId ?? null
        setCameraId(activeDeviceId)
      }

      const track = stream.getVideoTracks()[0]
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined
      if (!cancelled) setTorchAvailable(Boolean(caps?.torch))

      const chosen = await chooseEngine()
      if (cancelled) return
      setEngine(chosen)
      setStatus('scanning')

      if (chosen === 'native') {
        const formats = await negotiateFormats()
        const Detector = (window as never as { BarcodeDetector: new (o: unknown) => never })
          .BarcodeDetector
        const detector = new Detector({ formats }) as unknown as {
          detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>
        }
        detectorRef.current = detector

        const tick = async () => {
          if (cancelled || !videoRef.current) return
          if (pausedRef.current) {
            // Still scheduled, just not decoding — so resuming needs no restart
            // of the camera.
            rafRef.current = requestAnimationFrame(tick)
            return
          }
          try {
            const results = await detector.detect(videoRef.current)
            if (results?.[0]?.rawValue) handleHit(results[0].rawValue)
          } catch {
            // A dropped frame is normal; keep going.
          }
          if (!cancelled) rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // zxing path
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      if (cancelled) return
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoElement(
        videoRef.current as HTMLVideoElement,
        (result) => {
          if (result && !pausedRef.current) handleHit(result.getText())
        },
      )
      stopFnRef.current = () => controls.stop()
    }

    start().catch((err) => {
      if (!cancelled) {
        setDetail(err?.message ?? null)
        setStatus('failed')
      }
    })

    return () => {
      cancelled = true
      teardown()
    }
  }, [active, restartToken, handleHit, teardown])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn
      // `torch` is not in the standard MediaTrackConstraints type, but it is
      // what Chrome on Android implements and it is the only way to reach the
      // flashlight from the web.
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }, [torchOn])

  /**
   * Takes a still from the live track and reads it at full resolution.
   *
   * The live loop decodes the preview, which the browser scales down and which
   * carries motion blur from a handheld phone. A frozen frame at the track's own
   * resolution has more pixels across the bars and no smear, which is usually
   * the whole difference on a curved or glared label.
   *
   * Returns the outcome plus the frame as a data URL, so a miss can be shown to
   * the operator instead of being a silent no-op. Nothing is uploaded or stored.
   */
  const capture = useCallback(async (): Promise<
    CaptureOutcome & { photo?: string }
  > => {
    const video = videoRef.current
    if (!video || !isFrameReady(video)) {
      return { found: false, reason: 'not-ready' }
    }

    setCapturing(true)
    pausedRef.current = true
    try {
      const { width, height } = frameSize(video)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return { found: false, reason: 'error', detail: 'Could not read the frame.' }
      }
      ctx.drawImage(video, 0, 0, width, height)

      const outcome = await decodeFromCanvas(
        engine ?? 'zxing',
        canvas,
        detectorRef.current ?? undefined,
      )

      if (outcome.found) {
        // Straight down the same path a live read takes, deduper included, so a
        // capture of a label just scanned does not fire twice.
        pausedRef.current = false
        if (deduperRef.current.accept(outcome.value)) {
          onScanRef.current(outcome.value)
        }
        return outcome
      }

      // Kept paused: the operator is now looking at the photo, and the live loop
      // resuming underneath would be confusing. resumeAfterCapture() restarts it.
      let photo: string | undefined
      try {
        photo = canvas.toDataURL('image/jpeg', 0.85)
      } catch {
        // A tainted canvas cannot be exported. The decode still worked, so this
        // only costs the preview of the failed shot.
      }
      return { ...outcome, photo }
    } finally {
      setCapturing(false)
    }
  }, [engine])

  /** Returns to live decoding after a captured frame has been dismissed. */
  const resumeAfterCapture = useCallback(() => {
    pausedRef.current = false
  }, [])

  const selectCamera = useCallback((deviceId: string) => {
    // Persisted first: the effect reads the remembered id when it restarts.
    rememberCamera(deviceId)
    setCameraId(deviceId)
    setRestartToken((n) => n + 1)
  }, [])

  return {
    videoRef,
    status,
    engine,
    cameras,
    cameraId,
    detail,
    torchOn,
    torchAvailable,
    toggleTorch,
    selectCamera,
    capture,
    capturing,
    resumeAfterCapture,
  }
}

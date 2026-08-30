import { useEffect, useRef, useState } from 'react'

import { Button, Input, Modal, Select } from '@/components/Shared Components'

import { useBarcodeScanner, type ScannerStatus } from './useBarcodeScanner'

type Props = {
  open: boolean
  onClose: () => void
  onScan: (value: string) => void
  title?: string
  description?: string
  /** Keep the camera running after a hit — for continuous goods-in scanning. */
  continuous?: boolean
}

/**
 * What to say for each failure, and whether it is actually a failure.
 *
 * No camera on a desk machine is normal, not an error, so it is not styled as
 * one. Manual entry is always available underneath regardless — a scuffed label
 * is routine and typing it should never require first failing to scan.
 */
const STATUS_COPY: Record<
  Exclude<ScannerStatus, 'idle' | 'starting' | 'scanning'>,
  { tone: 'info' | 'warn'; title: string; body: string }
> = {
  'insecure-context': {
    tone: 'warn',
    title: 'Camera needs a secure connection',
    body: 'Browsers only allow camera access over HTTPS. This page is being served over plain HTTP, so scanning is unavailable here. It works on localhost and on any https:// address.',
  },
  'no-camera': {
    tone: 'info',
    title: 'No camera on this device',
    body: 'Nothing to scan with here — type or paste the code instead.',
  },
  'permission-denied': {
    tone: 'warn',
    title: 'Camera permission is blocked',
    body: 'Allow camera access for this site in your browser settings — usually the icon at the left of the address bar — then reopen the scanner.',
  },
  'camera-busy': {
    tone: 'warn',
    title: 'The camera is in use',
    body: 'Another application is holding it. Close anything using the camera, such as a video call, and try again.',
  },
  failed: {
    tone: 'warn',
    title: 'The scanner could not start',
    body: 'Something went wrong reaching the camera. You can still enter the code by hand.',
  },
}

export function BarcodeScanner({
  open,
  onClose,
  onScan,
  title = 'Scan a barcode',
  description = 'Hold the label steady inside the frame.',
  continuous = false,
}: Props) {
  const [manual, setManual] = useState('')
  const [slowHint, setSlowHint] = useState(false)

  const {
    videoRef,
    status,
    cameras,
    cameraId,
    detail,
    torchOn,
    torchAvailable,
    toggleTorch,
    selectCamera,
  } = useBarcodeScanner({ active: open, onScan, continuous })

  // After a while without a read, say so rather than leaving the operator
  // wondering whether it is working at all.
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    setSlowHint(false)
    if (status !== 'scanning') return
    timerRef.current = window.setTimeout(() => setSlowHint(true), 10_000)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [status])

  useEffect(() => {
    if (!open) {
      setManual('')
      setSlowHint(false)
    }
  }, [open])

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    const value = manual.trim()
    if (!value) return
    setManual('')
    onScan(value)
  }

  const failure = status !== 'idle' && status !== 'starting' && status !== 'scanning'
  const copy = failure ? STATUS_COPY[status] : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!failure && (
          <div className="relative overflow-hidden rounded-2xl bg-slate-900 aspect-[4/3]">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
            />

            {/* Aiming guide — a label centred here reads fastest. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>

            {status === 'starting' && (
              <div className="absolute inset-0 grid place-items-center text-sm text-white/80">
                Starting camera…
              </div>
            )}

            {torchAvailable && (
              <button
                type="button"
                onClick={toggleTorch}
                className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
              >
                {torchOn ? 'Light off' : 'Light on'}
              </button>
            )}
          </div>
        )}

        {copy && (
          <div
            className={`rounded-2xl border p-4 ${
              copy.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50'
            }`}
          >
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {copy.title}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{copy.body}</p>
            {detail && (
              <p className="mt-2 font-mono text-xs text-slate-400">{detail}</p>
            )}
          </div>
        )}

        {slowHint && status === 'scanning' && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Still looking. Try moving closer, steadying the label, or turning the light
            on — or type the code below.
          </p>
        )}

        {cameras.length > 1 && !failure && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Camera
            </label>
            <Select
              value={cameraId ?? ''}
              onChange={(e) => selectCamera(e.target.value)}
            >
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Always present, not only after a failure. */}
        <form onSubmit={submitManual} className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Or enter the code
          </label>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Barcode or SKU"
              autoFocus={failure}
            />
            <Button type="submit" disabled={!manual.trim()}>
              Find
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

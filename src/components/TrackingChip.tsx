import { useEffect, useRef, useState } from 'react'
import { findCourier } from '@/lib/couriers'
import { copyText } from '@/lib/clipboard'

/**
 * A shipment's consignment number: click to copy, with a permanent track icon
 * beside it that opens the courier.
 *
 * Two separate targets rather than one control that does both. Copying is the
 * common action and is safe to do by accident; opening a new tab is neither, so
 * it gets its own deliberate hit area. The icon is always visible rather than
 * revealed on hover — half the warehouse is on a touch screen, where there is no
 * hover, and a control that cannot be discovered is a control that is not there.
 *
 * Where the courier cannot accept the number in a URL (Evri and Royal Mail —
 * see src/lib/couriers.ts) the icon copies first and then opens their search
 * page, and its tooltip says so, because the operator will have to paste.
 */
export function TrackingChip({
  trackingId,
  courierName,
  onNotify,
}: {
  trackingId: string
  courierName?: string | null
  /** Surfaces the outcome — the page owns the toast. */
  onNotify?: (message: string, type: 'success' | 'error') => void
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const courier = findCourier(courierName)

  const flash = () => {
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  const copy = async (): Promise<boolean> => {
    const outcome = await copyText(trackingId)
    if (outcome === 'failed') {
      // Never claim a copy that did not happen: the operator would paste the
      // previous parcel's number onto this label.
      onNotify?.('Could not copy — select the number and copy it manually.', 'error')
      return false
    }
    flash()
    onNotify?.(`Tracking number ${trackingId} copied.`, 'success')
    return true
  }

  const track = async () => {
    if (!courier) return
    // Copy first for the couriers that cannot take it in the URL, so the paste
    // is ready in the tab that just opened.
    if (!courier.deepLinks) await copy()
    window.open(courier.trackingUrl(trackingId), '_blank', 'noopener,noreferrer')
  }

  const trackTitle = !courier
    ? `No tracking page configured for ${courierName || 'this courier'}`
    : courier.deepLinks
      ? `Track this parcel on ${courier.name}`
      : `Copy and open ${courier.name} — their site does not accept the number in a link, so paste it`

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <button
        type="button"
        onClick={copy}
        title={`Copy ${trackingId}`}
        // Without this the accessible name is just the number, so a screen
        // reader announces a bare string with no hint that it does anything.
        aria-label={`Copy tracking number ${trackingId}`}
        className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-2.5 font-mono text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <span className="truncate max-w-[14rem]">{trackingId}</span>
        {copied ? (
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400">
            <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
            <path d="M7 3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7.4a2 2 0 0 0-.6-1.4l-2.4-2.4A2 2 0 0 0 10.6 3H7Z" />
            <path d="M4 6a1 1 0 0 0-1 1v8a2 2 0 0 0 2 2h6a1 1 0 1 0 0-2H5a1 1 0 0 1-1-1V6Z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={track}
        disabled={!courier}
        title={trackTitle}
        aria-label={trackTitle}
        className="inline-flex size-6 [@media(pointer:coarse)]:size-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent disabled:hover:text-slate-500 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
          <path d="M11 3h6v6" />
          <path d="M17 3 9 11" />
          <path d="M15 12v3.5A1.5 1.5 0 0 1 13.5 17h-9A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5H8" />
        </svg>
      </button>
    </span>
  )
}

export default TrackingChip

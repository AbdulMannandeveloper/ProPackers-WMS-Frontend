/**
 * The couriers ProPackers ships with, and where to send someone holding a
 * consignment number.
 *
 * Every URL below was checked by hand against the live site on 2026-08-30, with
 * a syntactically valid but non-existent number. That matters, because two of
 * the five silently discard the number:
 *
 *   FedEx        ?trknbr=            the parameter survives into the tracking app
 *   DPD          /search?reference=  the URL is preserved exactly
 *   DHL          ?submit=1&tracking-id=  redirects tracking-parcel.html →
 *                                    tracking.html but keeps the parameters, so
 *                                    the canonical URL is used here directly
 *   Royal Mail   —                   #/tracking-results/<id> is dropped back to
 *                                    #/, landing on an empty search box
 *   Evri         —                   /track/parcel/<id> redirects to the
 *                                    homepage, and neither ?trackingNumber= nor
 *                                    ?tracking-number= pre-fills the field
 *
 * So `deepLinks` is not decoration. For the two that cannot carry the number,
 * the UI copies it to the clipboard first and says "Copy & open" rather than
 * "Track on", because the operator will have to paste it.
 *
 * If a courier changes their URL scheme, this file is the only place to fix.
 */

export type Courier = {
  /** Stored verbatim in shipments.courier_name — do not rename without a migration. */
  id: string
  /** Shown in the create-shipment dropdown. */
  label: string
  /** Shown in running text and on the track button. */
  name: string
  /**
   * Where to send someone holding this number. When `deepLinks` is false this
   * is the courier's search page and the number is not in it.
   */
  trackingUrl: (trackingId: string) => string
  /** Whether trackingUrl actually lands on the parcel. See the note above. */
  deepLinks: boolean
}

export const COURIERS: Courier[] = [
  {
    id: 'Evri',
    label: 'Evri Standard',
    name: 'Evri',
    // Evri's tracking page takes the number only from its own input box.
    trackingUrl: () => 'https://www.evri.com/track-a-parcel',
    deepLinks: false,
  },
  {
    id: 'DPD',
    label: 'DPD Next-Day',
    name: 'DPD',
    trackingUrl: (id) =>
      `https://track.dpd.co.uk/search?reference=${encodeURIComponent(id)}`,
    deepLinks: true,
  },
  {
    id: 'DHL',
    label: 'DHL Express',
    name: 'DHL',
    trackingUrl: (id) =>
      `https://www.dhl.com/gb-en/home/tracking.html?submit=1&tracking-id=${encodeURIComponent(id)}`,
    deepLinks: true,
  },
  {
    id: 'FedEx',
    label: 'FedEx International',
    name: 'FedEx',
    trackingUrl: (id) =>
      `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(id)}`,
    deepLinks: true,
  },
  {
    id: 'Royal Mail',
    label: 'Royal Mail Tracked 24',
    name: 'Royal Mail',
    // The #/tracking-results/<id> route is discarded on load.
    trackingUrl: () => 'https://www.royalmail.com/track-your-item',
    deepLinks: false,
  },
]

/**
 * Existing shipments carry whatever courier name was saved at the time,
 * including ones no longer offered. Returns undefined rather than guessing, so
 * the caller can still show the number without a track button.
 */
export const findCourier = (courierName?: string | null): Courier | undefined => {
  if (!courierName) return undefined
  const wanted = courierName.trim().toLowerCase()
  return COURIERS.find((c) => c.id.toLowerCase() === wanted)
}

/** The same normalisation the server applies, so the UI agrees with it. */
export const TRACKING_ID_MAX = 64
const TRACKING_ID_PATTERN = /^[A-Za-z0-9-]+$/

export const normaliseTrackingId = (raw: string): string =>
  raw.replace(/\s+/g, '')

/** Returns an error message, or null when the value is acceptable. */
export const validateTrackingId = (raw: string): string | null => {
  const cleaned = normaliseTrackingId(raw)
  if (cleaned === '') return null // empty clears it
  if (cleaned.length > TRACKING_ID_MAX)
    return `Tracking number is too long — ${TRACKING_ID_MAX} characters maximum.`
  if (!TRACKING_ID_PATTERN.test(cleaned))
    return 'Tracking number may contain only letters, numbers and hyphens.'
  return null
}

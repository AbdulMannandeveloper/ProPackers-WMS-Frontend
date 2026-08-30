/**
 * The courier registry.
 *
 * The URLs in couriers.ts were checked against the live sites on 2026-08-30.
 * These tests cannot re-check them — that needs a network and a real parcel —
 * so they guard the things that silently rot instead: the number surviving into
 * the URL, the `deepLinks` flag matching what was actually observed, and the
 * dropdown staying in step with what the server will accept.
 */

import { describe, it, expect } from 'vitest'

import {
  COURIERS,
  findCourier,
  validateTrackingId,
  normaliseTrackingId,
  TRACKING_ID_MAX,
} from './couriers'

describe('the registry', () => {
  it('offers Evri, which the warehouse actually ships with', () => {
    // It was missing from the dropdown entirely; shipments went out under a
    // courier nobody could pick.
    expect(COURIERS.map((c) => c.id)).toContain('Evri')
  })

  it('has no duplicate ids, since the id is what gets stored', () => {
    const ids = COURIERS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every courier a reachable https url', () => {
    for (const c of COURIERS) {
      const url = c.trackingUrl('ABC123')
      expect(url.startsWith('https://'), `${c.id}: ${url}`).toBe(true)
      expect(() => new URL(url)).not.toThrow()
    }
  })
})

describe('deep links carry the number', () => {
  const deepLinking = COURIERS.filter((c) => c.deepLinks)

  it('covers DPD, DHL and FedEx — the three observed to accept it', () => {
    expect(deepLinking.map((c) => c.id).sort()).toEqual(['DHL', 'DPD', 'FedEx'])
  })

  it.each(deepLinking.map((c) => [c.id, c] as const))(
    '%s puts the tracking number in the url',
    (_id, courier) => {
      expect(courier.trackingUrl('H01AA0123456789')).toContain('H01AA0123456789')
    }
  )

  it('escapes the number rather than pasting it raw', () => {
    // Tracking ids are validated to [A-Za-z0-9-] server-side, so this is a
    // second line rather than the only one — but a registry entry is exactly
    // the kind of thing someone later reuses for a free-text reference.
    for (const c of deepLinking) {
      expect(c.trackingUrl('a b&c=d')).not.toContain(' ')
      expect(c.trackingUrl('a b&c=d')).not.toContain('&c=d')
    }
  })
})

describe('couriers that cannot take the number in a url', () => {
  it('are Evri and Royal Mail, and are marked as such', () => {
    // Evri: /track/parcel/<id> redirects to the homepage and no query parameter
    // pre-fills the box. Royal Mail: the #/tracking-results/<id> hash is
    // dropped back to #/. Both were checked by hand.
    const shallow = COURIERS.filter((c) => !c.deepLinks).map((c) => c.id).sort()
    expect(shallow).toEqual(['Evri', 'Royal Mail'])
  })

  it('do not pretend to carry it', () => {
    // If one of these ever grows a working deep link, flip deepLinks with it —
    // the UI wording ("Copy & open" vs "Track on") reads from that flag.
    for (const c of COURIERS.filter((x) => !x.deepLinks)) {
      expect(c.trackingUrl('H01AA0123456789')).not.toContain('H01AA0123456789')
    }
  })
})

describe('findCourier', () => {
  it('finds one by its stored name', () => {
    expect(findCourier('Evri')?.name).toBe('Evri')
  })

  it('is not upset by case or stray whitespace', () => {
    expect(findCourier('  royal mail ')?.id).toBe('Royal Mail')
  })

  it('returns undefined for a courier no longer offered', () => {
    // Old shipments keep whatever was saved at the time. The chip still shows
    // the number; only the track button goes away.
    expect(findCourier('Hermes')).toBeUndefined()
  })

  it('returns undefined for nothing at all', () => {
    expect(findCourier(null)).toBeUndefined()
    expect(findCourier('')).toBeUndefined()
  })
})

describe('validation, which mirrors the server', () => {
  it('strips the spaces couriers print the number in', () => {
    expect(normaliseTrackingId('  H01AA 0123 4567 89 ')).toBe('H01AA0123456789')
  })

  it('accepts a normal number', () => {
    expect(validateTrackingId('H01AA0123456789')).toBeNull()
  })

  it('accepts hyphens', () => {
    expect(validateTrackingId('AB-12-CD')).toBeNull()
  })

  it('treats empty as clearing it, not as an error', () => {
    expect(validateTrackingId('')).toBeNull()
    expect(validateTrackingId('   ')).toBeNull()
  })

  it('rejects anything longer than the column holds', () => {
    expect(validateTrackingId('A'.repeat(TRACKING_ID_MAX + 1))).toMatch(/too long/i)
    expect(validateTrackingId('A'.repeat(TRACKING_ID_MAX))).toBeNull()
  })

  it('rejects characters no courier uses', () => {
    expect(validateTrackingId('../../etc/passwd')).toMatch(/letters, numbers/i)
    expect(validateTrackingId('<script>')).toMatch(/letters, numbers/i)
  })

  it('agrees with the server on the maximum, which is the column width', () => {
    expect(TRACKING_ID_MAX).toBe(64)
  })
})

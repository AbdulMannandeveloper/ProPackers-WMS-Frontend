/**
 * Picking arithmetic.
 *
 * Stock lives per bin, not per product, so an order larger than any single bin
 * has to be drawn from several. Getting this wrong is expensive in both
 * directions: over-picking a bin fails at save time after the operator has
 * already walked to it, and mis-counting the basket bills the client the wrong
 * amount, because the dispatch charge is per item.
 */

import { describe, it, expect } from 'vitest'

import {
  availableIn,
  binsFor,
  totalAvailable,
  validateSplit,
  splitTotal,
  toPickLines,
  toShipmentItems,
  basketUnitCount,
  estimateDispatchCharge,
  foreignLines,
  mergeLines,
  type Bin,
  type PickLine,
} from './picking'
import type { ScanMatch } from '@/api/products'

const bin = (locationId: string, current: number, reserved = 0): Bin => ({
  locationId,
  locationName: `Bin ${locationId}`,
  path: null,
  currentQuantity: current,
  reservedQuantity: reserved,
})

const match = (overrides: Partial<ScanMatch> = {}): ScanMatch =>
  ({
    id: 'p1',
    productName: 'Phone case',
    skuCode: 'SKU-1',
    clientId: 'c1',
    stockLevels: [],
    ...overrides,
  }) as ScanMatch

describe('what is actually available', () => {
  it('subtracts stock already promised to another shipment', () => {
    // Reserved units are physically on the shelf but spoken for.
    expect(availableIn(bin('A', 100, 30))).toBe(30 + 40)
  })

  it('never goes negative when reservations exceed the count', () => {
    // A data error should read as "nothing to take", not as a negative offer.
    expect(availableIn(bin('A', 5, 9))).toBe(0)
  })

  it('treats missing figures as zero', () => {
    expect(availableIn({ currentQuantity: 0, reservedQuantity: 0 })).toBe(0)
  })
})

describe('finding a product across bins', () => {
  it('lists every bin holding it', () => {
    const bins = binsFor(
      match({
        stockLevels: [
          { id: 's1', locationId: 'A', currentQuantity: 10, reservedQuantity: 0, location: { id: 'A', locationName: 'Aisle 1' } },
          { id: 's2', locationId: 'B', currentQuantity: 5, reservedQuantity: 0, location: { id: 'B', locationName: 'Aisle 2' } },
        ],
      })
    )
    expect(bins).toHaveLength(2)
  })

  it('drops bins with nothing left to give', () => {
    // Offering a bin that is fully reserved sends someone on a wasted walk.
    const bins = binsFor(
      match({
        stockLevels: [
          { id: 's1', locationId: 'A', currentQuantity: 10, reservedQuantity: 10, location: { id: 'A', locationName: 'Aisle 1' } },
          { id: 's2', locationId: 'B', currentQuantity: 5, reservedQuantity: 0, location: { id: 'B', locationName: 'Aisle 2' } },
        ],
      })
    )
    expect(bins.map((b) => b.locationId)).toEqual(['B'])
  })

  it('puts the fullest bin first, so one stop usually does', () => {
    const bins = binsFor(
      match({
        stockLevels: [
          { id: 's1', locationId: 'A', currentQuantity: 3, reservedQuantity: 0, location: { id: 'A', locationName: 'Aisle 1' } },
          { id: 's2', locationId: 'B', currentQuantity: 40, reservedQuantity: 0, location: { id: 'B', locationName: 'Aisle 2' } },
        ],
      })
    )
    expect(bins[0].locationId).toBe('B')
  })

  it('copes with a product that has no stock rows at all', () => {
    expect(binsFor(match())).toEqual([])
  })

  it('totals what is on hand across bins', () => {
    expect(totalAvailable([bin('A', 10, 2), bin('B', 5)])).toBe(13)
  })
})

describe('validating a split', () => {
  const bins = [bin('A', 10), bin('B', 5)]

  it('accepts a split within what each bin holds', () => {
    expect(validateSplit(bins, { A: 8, B: 5 })).toEqual([])
  })

  it('rejects taking more than a bin has', () => {
    const problems = validateSplit(bins, { A: 8, B: 9 })
    expect(problems).toHaveLength(1)
    expect(problems[0].locationId).toBe('B')
    expect(problems[0].message).toMatch(/only 5 available/i)
  })

  it('reports every offending bin at once', () => {
    // Fixing a three-bin split one error at a time is its own frustration.
    expect(validateSplit(bins, { A: 99, B: 99 })).toHaveLength(2)
  })

  it('ignores bins left blank', () => {
    expect(validateSplit(bins, { A: 3 })).toEqual([])
  })

  it('rejects a fractional quantity', () => {
    // Units are whole things.
    expect(validateSplit(bins, { A: 2.5 })).toHaveLength(1)
  })

  it('adds up what the split comes to', () => {
    expect(splitTotal({ A: 8, B: 5 })).toBe(13)
  })

  it('does not count blank or negative entries in the total', () => {
    expect(splitTotal({ A: 8, B: 0, C: -3 })).toBe(8)
  })
})

describe('turning a split into basket lines', () => {
  const bins = [bin('A', 10), bin('B', 5)]

  it('makes one line per bin drawn from', () => {
    // This is the multi-bin pick: one product, two rows, which is exactly what
    // ShipmentItem already models.
    const lines = toPickLines(match(), bins, { A: 8, B: 5 })
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.quantity)).toEqual([8, 5])
  })

  it('leaves out bins contributing nothing', () => {
    const lines = toPickLines(match(), bins, { A: 8, B: 0 })
    expect(lines).toHaveLength(1)
    expect(lines[0].locationId).toBe('A')
  })

  it('produces exactly the payload the API takes', () => {
    const lines = toPickLines(match(), bins, { A: 2 })
    expect(toShipmentItems(lines)).toEqual([
      { productId: 'p1', sourceLocationId: 'A', quantity: 2 },
    ])
  })
})

describe('the basket', () => {
  const line = (over: Partial<PickLine> = {}): PickLine => ({
    productId: 'p1',
    productName: 'Phone case',
    skuCode: 'SKU-1',
    clientId: 'c1',
    locationId: 'A',
    locationName: 'Aisle 1',
    quantity: 5,
    ...over,
  })

  it('counts units, not lines', () => {
    // The charge is per item, so this number is the invoice.
    expect(
      basketUnitCount([line({ quantity: 20 }), line({ locationId: 'B', quantity: 6 })])
    ).toBe(26)
  })

  it('merges a repeat pick of the same product and bin', () => {
    const merged = mergeLines([line({ quantity: 5 })], [line({ quantity: 3 })])
    expect(merged).toHaveLength(1)
    expect(merged[0].quantity).toBe(8)
  })

  it('keeps the same product in a different bin as its own line', () => {
    const merged = mergeLines([line()], [line({ locationId: 'B' })])
    expect(merged).toHaveLength(2)
  })

  it('flags products belonging to another client', () => {
    // Their goods are not ours to ship, and the charge would land on the wrong
    // invoice.
    const wrong = line({ clientId: 'c2', productName: 'Someone else stock' })
    expect(foreignLines([line(), wrong], 'c1')).toEqual([wrong])
  })
})

describe('the charge estimate', () => {
  const line = (quantity: number): PickLine => ({
    productId: 'p1',
    productName: 'Phone case',
    skuCode: 'SKU-1',
    clientId: 'c1',
    locationId: 'A',
    locationName: 'Aisle 1',
    quantity,
  })

  it('is units times the agreed per-item rate', () => {
    expect(estimateDispatchCharge([line(20), line(6)], 2.5)).toBe(65)
  })

  it('rounds to pennies', () => {
    expect(estimateDispatchCharge([line(3)], 0.335)).toBe(1.01)
  })

  it('is null when the client has no dispatch rate', () => {
    // Not zero: "not charged for shipping" and "charged nothing" read
    // differently to whoever is looking at the screen.
    expect(estimateDispatchCharge([line(10)], null)).toBeNull()
  })

  it('is zero for an empty basket on a real rate', () => {
    expect(estimateDispatchCharge([], 2)).toBe(0)
  })
})

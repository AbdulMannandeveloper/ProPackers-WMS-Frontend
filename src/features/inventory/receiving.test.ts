/**
 * The goods-in basket.
 *
 * The behaviour that makes the bench fast is folding: a second scan of the same
 * carton is a quantity, not a second line and not a second dialog. Everything
 * here is about that fold holding under the ways an operator actually works —
 * scanning the same thing repeatedly, typing a number instead, correcting a
 * bin, mixing new stock with old.
 */

import { describe, it, expect } from 'vitest'

import {
  addScannedProduct,
  addNewProductLine,
  findLineByCode,
  setQuantity,
  setLineLocation,
  removeLine,
  totals,
  validateBasket,
  findSkuClash,
  toBatchPayload,
  isNewLine,
  type ReceivingLine,
} from './receiving'

const product = (id: string, skuCode: string, productName = 'Widget') =>
  ({
    id,
    clientId: 'c1',
    skuCode,
    productName,
    thresholdLimit: 5,
    isDeactivated: false,
  }) as never

const draft = (skuCode: string, over: Record<string, unknown> = {}) => ({
  clientId: 'c1',
  skuCode,
  productName: 'Jiffy Bags',
  ...over,
})

describe('scanning the same carton again', () => {
  it('counts it rather than adding a second line', () => {
    let lines: ReceivingLine[] = []
    lines = addScannedProduct(lines, product('p1', 'SKU-100'))
    lines = addScannedProduct(lines, product('p1', 'SKU-100'))
    lines = addScannedProduct(lines, product('p1', 'SKU-100'))

    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
  })

  it('leaves other lines alone while it counts', () => {
    let lines: ReceivingLine[] = []
    lines = addScannedProduct(lines, product('p1', 'SKU-100'))
    lines = addScannedProduct(lines, product('p2', 'SKU-200'))
    lines = addScannedProduct(lines, product('p1', 'SKU-100'))

    expect(lines).toHaveLength(2)
    expect(lines.find((l) => l.key === 'p:p1')!.quantity).toBe(2)
    expect(lines.find((l) => l.key === 'p:p2')!.quantity).toBe(1)
  })

  it('does not mutate the array it was given', () => {
    // The basket is React state; mutating it in place means no re-render.
    const before = addScannedProduct([], product('p1', 'SKU-100'))
    const after = addScannedProduct(before, product('p1', 'SKU-100'))

    expect(before[0].quantity).toBe(1)
    expect(after[0].quantity).toBe(2)
    expect(after).not.toBe(before)
  })
})

describe('a mixed pallet', () => {
  it('holds a line per distinct product', () => {
    let lines: ReceivingLine[] = []
    for (const [id, sku] of [
      ['p1', 'SKU-100'],
      ['p2', 'SKU-200'],
      ['p3', 'SKU-300'],
    ]) {
      lines = addScannedProduct(lines, product(id, sku))
    }

    expect(totals(lines)).toEqual({ lines: 3, units: 3, newProducts: 0 })
  })

  it('counts new and existing stock together', () => {
    let lines: ReceivingLine[] = []
    lines = addScannedProduct(lines, product('p1', 'SKU-100'), 3)
    lines = addNewProductLine(lines, draft('SKU-NEW'), 2)

    expect(totals(lines)).toEqual({ lines: 2, units: 5, newProducts: 1 })
  })
})

describe('a product that is not in the catalogue yet', () => {
  it('joins the basket without being written anywhere', () => {
    const lines = addNewProductLine([], draft('SKU-NEW', { barcode: '5012345678900' }))

    expect(lines).toHaveLength(1)
    expect(isNewLine(lines[0])).toBe(true)
  })

  it('increments on a second scan instead of asking for details again', () => {
    // Scanning an unknown label twice is ordinary; being made to describe it
    // twice is not.
    const d = draft('SKU-NEW', { barcode: '5012345678900' })
    let lines = addNewProductLine([], d)
    lines = addNewProductLine(lines, d)

    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(2)
  })

  it('is found by its barcode so a repeat scan skips the lookup', () => {
    const lines = addNewProductLine([], draft('SKU-NEW', { barcode: '5012345678900' }))

    expect(findLineByCode(lines, '5012345678900')).toBeTruthy()
    expect(findLineByCode(lines, 'SKU-NEW')).toBeTruthy()
    expect(findLineByCode(lines, 'nothing')).toBeUndefined()
  })
})

describe('correcting a line by hand', () => {
  it('a typed quantity replaces the counted one', () => {
    // Forty cartons are typed, not scanned forty times. If this added instead
    // of replacing, the operator would have to work out 40 minus what they had
    // already scanned.
    let lines = addScannedProduct([], product('p1', 'SKU-100'))
    lines = addScannedProduct(lines, product('p1', 'SKU-100'))
    lines = setQuantity(lines, 'p:p1', 40)

    expect(lines[0].quantity).toBe(40)
  })

  it('a line can go to a different bin from the rest', () => {
    let lines = addScannedProduct([], product('p1', 'SKU-100'))
    lines = addScannedProduct(lines, product('p2', 'SKU-200'))
    lines = setLineLocation(lines, 'p:p2', 'loc-b')

    expect(lines.find((l) => l.key === 'p:p1')!.locationId).toBeUndefined()
    expect(lines.find((l) => l.key === 'p:p2')!.locationId).toBe('loc-b')
  })

  it('a line can be taken off the delivery', () => {
    let lines = addScannedProduct([], product('p1', 'SKU-100'))
    lines = addScannedProduct(lines, product('p2', 'SKU-200'))

    expect(removeLine(lines, 'p:p1')).toHaveLength(1)
    expect(removeLine(lines, 'p:p1')[0].key).toBe('p:p2')
  })
})

describe('what stops a delivery being committed', () => {
  it('an empty basket', () => {
    expect(validateBasket([], 'loc-a')).toMatch(/scan something/i)
  })

  it('no bin chosen, and no line carrying its own', () => {
    const lines = addScannedProduct([], product('p1', 'SKU-100'))
    expect(validateBasket(lines, undefined)).toMatch(/location/i)
  })

  it('but a line with its own bin needs no session bin', () => {
    let lines = addScannedProduct([], product('p1', 'SKU-100'))
    lines = setLineLocation(lines, 'p:p1', 'loc-b')

    expect(validateBasket(lines, undefined)).toBeNull()
  })

  it('a quantity that is zero, negative or fractional', () => {
    const lines = addScannedProduct([], product('p1', 'SKU-100', 'Blue Tape'))

    for (const bad of [0, -1, 2.5]) {
      expect(validateBasket(setQuantity(lines, 'p:p1', bad), 'loc-a')).toMatch(
        /quantity/i,
      )
    }
  })

  it('names the product that is wrong, not just "a line"', () => {
    const lines = addScannedProduct([], product('p1', 'SKU-100', 'Blue Tape'))
    expect(validateBasket(setQuantity(lines, 'p:p1', 0), 'loc-a')).toMatch(/Blue Tape/)
  })

  it('a good basket passes', () => {
    const lines = addScannedProduct([], product('p1', 'SKU-100'))
    expect(validateBasket(lines, 'loc-a')).toBeNull()
  })
})

describe('catching a duplicate SKU before the server does', () => {
  const catalogue = [product('p1', 'SKU-100', 'Blue Tape')] as never as never[]

  it('spots one the client already has', () => {
    expect(findSkuClash([], catalogue, { clientId: 'c1', skuCode: 'SKU-100' })).toMatch(
      /already has/i,
    )
  })

  it('is case-insensitive, because a SKU typed in lower case is the same SKU', () => {
    expect(
      findSkuClash([], catalogue, { clientId: 'c1', skuCode: 'sku-100' }),
    ).toBeTruthy()
  })

  it('allows the same SKU for a different client', () => {
    // SKUs are unique per client, not globally — two clients stocking the same
    // catalogue number is ordinary.
    expect(
      findSkuClash([], catalogue, { clientId: 'c2', skuCode: 'SKU-100' }),
    ).toBeNull()
  })

  it('spots one already on this delivery', () => {
    const lines = addNewProductLine([], draft('SKU-NEW'))
    expect(
      findSkuClash(lines, [], { clientId: 'c1', skuCode: 'SKU-NEW' }),
    ).toMatch(/already on this delivery/i)
  })

  it('passes a SKU nobody is using', () => {
    expect(
      findSkuClash([], catalogue, { clientId: 'c1', skuCode: 'SKU-FRESH' }),
    ).toBeNull()
  })
})

describe('what gets sent to the server', () => {
  it('sends existing products by id and new ones by their details', () => {
    let lines = addScannedProduct([], product('p1', 'SKU-100'), 3)
    lines = addNewProductLine(lines, draft('SKU-NEW'), 2)

    const payload = toBatchPayload(lines, 'loc-a')

    expect(payload.toLocationId).toBe('loc-a')
    expect(payload.lines[0]).toEqual({ productId: 'p1', quantity: 3 })
    expect(payload.lines[1]).toMatchObject({
      newProduct: { skuCode: 'SKU-NEW' },
      quantity: 2,
    })
  })

  it('omits a line location that matches the session bin', () => {
    // Sending it anyway would be harmless but noisy, and would make a diff of
    // two deliveries look different when they are not.
    let lines = addScannedProduct([], product('p1', 'SKU-100'))
    lines = setLineLocation(lines, 'p:p1', 'loc-a')

    expect(toBatchPayload(lines, 'loc-a').lines[0]).not.toHaveProperty('toLocationId')
  })

  it('sends a line location that differs', () => {
    let lines = addScannedProduct([], product('p1', 'SKU-100'))
    lines = setLineLocation(lines, 'p:p1', 'loc-b')

    expect(toBatchPayload(lines, 'loc-a').lines[0]).toMatchObject({
      toLocationId: 'loc-b',
    })
  })

  it('sends quantities as numbers, not the strings an input produces', () => {
    let lines = addScannedProduct([], product('p1', 'SKU-100'))
    lines = setQuantity(lines, 'p:p1', '12' as never)

    expect(toBatchPayload(lines, 'loc-a').lines[0].quantity).toBe(12)
  })
})

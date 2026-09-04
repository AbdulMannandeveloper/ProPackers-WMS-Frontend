import type { Product, ScanMatch } from '@/api/products'

/**
 * The goods-in basket.
 *
 * An employee at the bench scans a pallet of mixed stock. Scanning the same
 * carton three times should mean three, not three trips through a dialog — so
 * the basket is a list that a scan folds into, and nothing is written until the
 * whole delivery is confirmed.
 *
 * Kept as plain functions over an array, like features/shipments/picking.ts, so
 * every rule here is testable without a camera or a rendered component.
 */

export type NewProductDraft = {
  clientId: string
  skuCode: string
  productName: string
  barcode?: string | null
  colour?: string | null
  size?: string | null
  weight?: number | null
  thresholdLimit?: number
}

type LineBase = {
  /** Stable identity for React and for the edit helpers below. */
  key: string
  quantity: number
  /** Overrides the session's bin when set. */
  locationId?: string
}

export type ExistingLine = LineBase & {
  kind: 'existing'
  productId: string
  skuCode: string
  productName: string
  clientName?: string
}

export type NewLine = LineBase & {
  kind: 'new'
  draft: NewProductDraft
}

export type ReceivingLine = ExistingLine | NewLine

export const isNewLine = (line: ReceivingLine): line is NewLine => line.kind === 'new'

const keyForExisting = (productId: string) => `p:${productId}`
/** Barcode when there is one, else the SKU — both are unique per new product. */
const keyForNew = (draft: NewProductDraft) =>
  `n:${draft.barcode?.trim() || `${draft.clientId}:${draft.skuCode.trim().toLowerCase()}`}`

/**
 * Folds a scanned or looked-up product into the basket.
 *
 * The second scan of the same carton increments rather than adding a line —
 * that is the whole point of scanning repeatedly instead of typing a number.
 */
export const addScannedProduct = (
  lines: ReceivingLine[],
  product: Product | ScanMatch,
  quantity = 1,
): ReceivingLine[] => {
  const key = keyForExisting(product.id)
  const existing = lines.find((l) => l.key === key)

  if (existing) {
    return lines.map((l) =>
      l.key === key ? { ...l, quantity: l.quantity + quantity } : l,
    )
  }

  const line: ExistingLine = {
    kind: 'existing',
    key,
    productId: product.id,
    skuCode: product.skuCode,
    productName: product.productName,
    clientName: (product as ScanMatch).client?.companyName,
    quantity,
  }
  return [...lines, line]
}

/**
 * Adds a product that does not exist yet, or increments it if the same code has
 * already been captured in this session — scanning an unknown label twice must
 * not ask for its details twice.
 */
export const addNewProductLine = (
  lines: ReceivingLine[],
  draft: NewProductDraft,
  quantity = 1,
): ReceivingLine[] => {
  const key = keyForNew(draft)
  const existing = lines.find((l) => l.key === key)

  if (existing) {
    return lines.map((l) =>
      l.key === key ? { ...l, quantity: l.quantity + quantity } : l,
    )
  }

  const line: NewLine = { kind: 'new', key, draft, quantity }
  return [...lines, line]
}

/** A code already in the basket, so a repeat scan can skip the lookup. */
export const findLineByCode = (
  lines: ReceivingLine[],
  code: string,
): ReceivingLine | undefined => {
  const needle = code.trim().toLowerCase()
  if (!needle) return undefined

  return lines.find((line) => {
    if (isNewLine(line)) {
      return (
        line.draft.barcode?.trim().toLowerCase() === needle ||
        line.draft.skuCode.trim().toLowerCase() === needle
      )
    }
    return line.skuCode.trim().toLowerCase() === needle
  })
}

/** Replaces the counted quantity. Typing 40 means 40, not "40 more". */
export const setQuantity = (
  lines: ReceivingLine[],
  key: string,
  quantity: number,
): ReceivingLine[] =>
  lines.map((l) => (l.key === key ? { ...l, quantity } : l))

export const setLineLocation = (
  lines: ReceivingLine[],
  key: string,
  locationId: string | undefined,
): ReceivingLine[] =>
  lines.map((l) => (l.key === key ? { ...l, locationId } : l))

export const removeLine = (lines: ReceivingLine[], key: string): ReceivingLine[] =>
  lines.filter((l) => l.key !== key)

export const totals = (lines: ReceivingLine[]) => ({
  lines: lines.length,
  units: lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
  newProducts: lines.filter(isNewLine).length,
})

/**
 * Why the basket cannot be committed yet, or null when it can.
 *
 * Checked here rather than left to the server so the operator is told which
 * line is wrong while they are still holding the carton.
 */
export const validateBasket = (
  lines: ReceivingLine[],
  sessionLocationId: string | undefined,
): string | null => {
  if (lines.length === 0) return 'Scan something before checking the delivery in.'

  if (!sessionLocationId && lines.some((l) => !l.locationId)) {
    return 'Choose a location for this delivery.'
  }

  const bad = lines.find(
    (l) => !Number.isInteger(Number(l.quantity)) || Number(l.quantity) <= 0,
  )
  if (bad) {
    const name = isNewLine(bad) ? bad.draft.productName : bad.productName
    return `${name || 'A line'} needs a whole quantity above zero.`
  }

  return null
}

/**
 * A SKU this client already has, whether in the catalogue or elsewhere in the
 * basket. SKUs are unique per client, so a clash only matters within one.
 */
export const findSkuClash = (
  lines: ReceivingLine[],
  catalogue: Product[],
  draft: Pick<NewProductDraft, 'clientId' | 'skuCode'>,
): string | null => {
  const sku = draft.skuCode.trim().toLowerCase()
  if (!sku) return null

  const inCatalogue = catalogue.find(
    (p) => p.clientId === draft.clientId && p.skuCode.trim().toLowerCase() === sku,
  )
  if (inCatalogue) {
    return `That client already has SKU ${inCatalogue.skuCode} (${inCatalogue.productName}).`
  }

  const inBasket = lines
    .filter(isNewLine)
    .find(
      (l) =>
        l.draft.clientId === draft.clientId &&
        l.draft.skuCode.trim().toLowerCase() === sku,
    )
  if (inBasket) {
    return `SKU ${inBasket.draft.skuCode} is already on this delivery.`
  }

  return null
}

/** The shape POST /api/inventory-ledgers/batch expects. */
export const toBatchPayload = (
  lines: ReceivingLine[],
  sessionLocationId: string | undefined,
) => ({
  toLocationId: sessionLocationId,
  lines: lines.map((line) => ({
    ...(isNewLine(line)
      ? { newProduct: line.draft }
      : { productId: line.productId }),
    quantity: Number(line.quantity),
    // Omitted unless it differs, so the server falls back to the session bin.
    ...(line.locationId && line.locationId !== sessionLocationId
      ? { toLocationId: line.locationId }
      : {}),
  })),
})

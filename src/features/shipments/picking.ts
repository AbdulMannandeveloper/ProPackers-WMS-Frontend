import type { ScanMatch } from '@/api/products'

/**
 * The arithmetic behind picking a shipment, kept out of the component so it can
 * be tested without a DOM.
 *
 * The rule that shapes all of it: stock lives per bin, not per product. A
 * product sitting in three bins is three separate quantities, and an order for
 * more than any one bin holds has to be drawn from several. The server already
 * models this — ShipmentItem is keyed on (product, location) with its own
 * quantity — so a split is simply more rows, not a new concept.
 */

export type Bin = {
  locationId: string
  locationName: string
  path?: string | null
  currentQuantity: number
  reservedQuantity: number
}

/** One line of the basket: this many of this product, out of this bin. */
export type PickLine = {
  productId: string
  productName: string
  skuCode: string
  clientId: string
  locationId: string
  locationName: string
  quantity: number
}

/**
 * What can actually be taken from a bin.
 *
 * Reserved stock is physically present but already promised to another
 * shipment, so it is not available. decreaseAvailableStockAtomically on the
 * server enforces the same subtraction; showing anything else here just means
 * the operator finds out at save time.
 */
export const availableIn = (bin: Pick<Bin, 'currentQuantity' | 'reservedQuantity'>) =>
  Math.max(0, (bin.currentQuantity ?? 0) - (bin.reservedQuantity ?? 0))

/** Every bin holding a product, most-available first, empties dropped. */
export const binsFor = (match: ScanMatch): Bin[] =>
  (match.stockLevels ?? [])
    .map((s) => ({
      locationId: s.locationId,
      locationName: s.location?.locationName ?? 'Unknown location',
      path: s.location?.materializedPath ?? null,
      currentQuantity: s.currentQuantity ?? 0,
      reservedQuantity: s.reservedQuantity ?? 0,
    }))
    .filter((b) => availableIn(b) > 0)
    .sort((a, b) => availableIn(b) - availableIn(a))

/** Total available for a product across every bin. */
export const totalAvailable = (bins: Bin[]) =>
  bins.reduce((sum, b) => sum + availableIn(b), 0)

export type SplitProblem = {
  locationId: string
  message: string
}

/**
 * Checks a proposed split of one product across bins.
 *
 * Returns a problem per offending bin rather than the first failure, so an
 * operator fixing a three-bin split sees all of it at once instead of
 * discovering the next error after correcting this one.
 */
export const validateSplit = (
  bins: Bin[],
  quantities: Record<string, number>
): SplitProblem[] => {
  const problems: SplitProblem[] = []

  for (const bin of bins) {
    const wanted = quantities[bin.locationId] ?? 0
    if (wanted === 0) continue

    if (!Number.isInteger(wanted) || wanted < 0) {
      problems.push({
        locationId: bin.locationId,
        message: 'Quantity must be a whole number above zero.',
      })
      continue
    }

    const available = availableIn(bin)
    if (wanted > available) {
      problems.push({
        locationId: bin.locationId,
        message: `Only ${available} available in ${bin.locationName}.`,
      })
    }
  }

  return problems
}

/** How many units a split adds up to. */
export const splitTotal = (quantities: Record<string, number>) =>
  Object.values(quantities).reduce(
    (sum, q) => sum + (Number.isFinite(q) && q > 0 ? q : 0),
    0
  )

/** Turns a validated split into basket lines — one per bin actually drawn from. */
export const toPickLines = (
  match: ScanMatch,
  bins: Bin[],
  quantities: Record<string, number>
): PickLine[] =>
  bins
    .filter((b) => (quantities[b.locationId] ?? 0) > 0)
    .map((b) => ({
      productId: match.id,
      productName: match.productName,
      skuCode: match.skuCode,
      clientId: match.clientId,
      locationId: b.locationId,
      locationName: b.locationName,
      quantity: quantities[b.locationId],
    }))

/** The payload shape POST /api/shipments already accepts. */
export const toShipmentItems = (lines: PickLine[]) =>
  lines.map(({ productId, locationId, quantity }) => ({
    productId,
    sourceLocationId: locationId,
    quantity,
  }))

/** Units across the whole basket — what the dispatch charge is calculated on. */
export const basketUnitCount = (lines: PickLine[]) =>
  lines.reduce((sum, l) => sum + l.quantity, 0)

/**
 * What this shipment will cost the client to dispatch.
 *
 * Per item, matching the server: the charge is the summed unit count times the
 * client's agreed SHIPMENT_DISPATCH rate. Null when they have no such rate,
 * which is a real arrangement — a services-only client ships through someone
 * else — and must read as "not charged", not as "free".
 */
export const estimateDispatchCharge = (
  lines: PickLine[],
  ratePerItem: number | null
): number | null => {
  if (ratePerItem === null || !Number.isFinite(ratePerItem)) return null
  return Number((basketUnitCount(lines) * ratePerItem).toFixed(2))
}

/**
 * Products belonging to another client have no business on this shipment: the
 * goods are not theirs and the charge would land on the wrong invoice.
 */
export const foreignLines = (lines: PickLine[], clientId: string) =>
  lines.filter((l) => l.clientId !== clientId)

/**
 * Whose shipment this is, worked out from what has been picked.
 *
 * The client used to be chosen before anything was picked, which is the wrong
 * order — the goods already know whose they are. Null until the first pick.
 */
export const clientOfBasket = (lines: PickLine[]): string | null =>
  lines.length > 0 ? lines[0].clientId : null

/**
 * Why this product cannot join the shipment, or null when it can.
 *
 * Takes the scan match rather than a line so it can name the client the goods
 * actually belong to: "belongs to Nestle" tells the operator what to do next,
 * where "wrong client" does not.
 */
export const describeForeignPick = (
  match: Pick<ScanMatch, 'clientId' | 'productName'> & {
    client?: { companyName?: string } | null
  },
  basketClientId: string | null,
  basketClientName?: string | null,
): string | null => {
  if (basketClientId === null || match.clientId === basketClientId) return null

  const theirs = match.client?.companyName ?? 'another client'
  const ours = basketClientName ?? "this shipment's client"

  return `${match.productName} belongs to ${theirs}. A shipment can only carry one client's goods, and this one is ${ours}'s.`
}

/**
 * Sets one line's quantity. Indexed rather than keyed, because a basket can
 * legitimately hold the same product twice — once per bin it is drawn from.
 */
export const setLineQuantity = (
  lines: PickLine[],
  index: number,
  quantity: number,
): PickLine[] =>
  lines.map((l, i) => (i === index ? { ...l, quantity } : l))

export const removeLineAt = (lines: PickLine[], index: number): PickLine[] =>
  lines.filter((_, i) => i !== index)

/** Merges a repeat pick of the same product and bin instead of duplicating it. */
export const mergeLines = (existing: PickLine[], incoming: PickLine[]): PickLine[] => {
  const merged = [...existing]

  for (const line of incoming) {
    const at = merged.findIndex(
      (l) => l.productId === line.productId && l.locationId === line.locationId
    )
    if (at === -1) {
      merged.push(line)
    } else {
      merged[at] = { ...merged[at], quantity: merged[at].quantity + line.quantity }
    }
  }

  return merged
}

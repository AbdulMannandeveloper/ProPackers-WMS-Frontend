import httpClient from '../http-client'

/**
 * Mirrors the Postgres enums added in chunk 1.2. Status moves only through the
 * transition endpoints below — the server rejects it on the generic update, so
 * sending `{ status }` to updateShipment silently does nothing.
 */
export type ShipmentStatus =
  | 'PENDING'
  | 'READY_FOR_DISPATCH'
  | 'DISPATCHED'
  | 'CANCELLED'

export type ShipmentItemStatus = 'PENDING' | 'PICKED'

export type ShipmentItem = {
  id: string
  shipmentId: string
  productId: string
  sourceLocationId: string
  quantity: number
  status: ShipmentItemStatus
  /** How much of this line has come back after dispatch. */
  returnedQuantity?: number
  /** Set when this line ships under its own consignment number. */
  trackingId?: string | null
  product?: {
    id: string
    skuCode: string
    productName: string
  }
  sourceLocation?: {
    id: string
    locationName: string
    materializedPath: string
    zone?: string | null
    shelf?: string | null
    bin?: string | null
  }
}

export type ShipmentService = {
  id: string
  shipmentId: string
  serviceId: string
  quantity: number
  appliedUnitPrice: number
  service?: {
    id: string
    description: string
    unit: string
  }
}

export type Shipment = {
  id: string
  employeeId: string
  clientId: string
  shipmentType: string
  status: ShipmentStatus
  packagingType: string
  courierName: string
  /** Courier consignment number. An item's own trackingId takes precedence. */
  trackingId?: string | null
  createdAt: string
  client?: {
    id: string
    companyName: string
    contactName: string
    email: string
  }
  employee?: {
    id: string
    user?: {
      firstName: string
      lastName: string
      email: string
    }
  }
  shipmentItems?: ShipmentItem[]
  shipmentServices?: ShipmentService[]
}

const BASE = '/api/shipments'

export const getAllShipments = (): Promise<Shipment[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const getShipmentsByClientId = (clientId: string): Promise<Shipment[]> =>
  httpClient({ method: 'GET', url: `${BASE}/client/${clientId}` })

/**
 * The shipment carrying this label, or null.
 *
 * Asked before anything is picked. Finding out a label was already used at save
 * time would mean unpicking a pallet.
 */
export const findByReference = async (reference: string): Promise<Shipment | null> => {
  try {
    const found = await httpClient<Shipment | Shipment[]>({
      method: 'GET',
      url: `${BASE}/field/reference/${encodeURIComponent(reference)}`,
    })
    const one = Array.isArray(found) ? found[0] : found
    return one ?? null
  } catch (err) {
    // A 404 is the answer "no such label", not a failure.
    if ((err as { response?: { status?: number } })?.response?.status === 404) return null
    throw err
  }
}

export const getShipmentById = (id: string): Promise<Shipment> =>
  httpClient({ method: 'GET', url: `${BASE}/field/id/${id}` })

/**
 * Creates a shipment and dispatches it in one act.
 *
 * The client is derived from the goods, the creator from the session, and the
 * status is decided by the server — none of them are sent. `reference` is the
 * label scanned off the parcel and is required.
 */
export const createShipment = (payload: {
  reference: string
  trackingId?: string
  shipmentItems: { productId: string; sourceLocationId: string; quantity: number }[]
}): Promise<Shipment> =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const updateShipment = (
  id: string,
  payload: {
    shipmentType?: string
    packagingType?: string
    courierName?: string
  }
): Promise<Shipment> =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

/**
 * The courier consignment number.
 *
 * Staff, not admin-only — the person handing the parcel over is the one holding
 * the label. Allowed in every status but CANCELLED, including DISPATCHED, which
 * is when couriers usually issue it. Send an empty string to clear a mis-key.
 */
export const setShipmentTracking = (
  id: string,
  trackingId: string | null
): Promise<Shipment> =>
  httpClient({
    method: 'PUT',
    url: `${BASE}/${id}/tracking`,
    data: { trackingId },
  })

// ─── Lifecycle transitions ────────────────────────────────────────────────────
// Each is guarded server-side against the state machine; an illegal hop comes
// back as a 400 whose message names what is allowed from here.

/** PENDING → READY_FOR_DISPATCH. Requires every item picked. Staff. */
export const markShipmentReady = (id: string): Promise<Shipment> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/ready` })

/** READY_FOR_DISPATCH → DISPATCHED. Staff. */
export const dispatchShipment = (id: string): Promise<{ message: string }> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/dispatch` })

/** → CANCELLED, releasing reserved stock. Admin only. */
export const cancelShipment = (id: string, reason?: string): Promise<Shipment> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/cancel`, data: { reason } })

/** READY_FOR_DISPATCH → PENDING, to correct a premature "ready". Admin only. */
export const reopenShipment = (id: string): Promise<Shipment> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/reopen` })

/** Admin only, and refused once dispatched — the ledger references it. */
export const deleteShipment = (id: string): Promise<{ message: string }> =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

// ─── Item transitions ─────────────────────────────────────────────────────────

/** Line is off the shelf. Only while the shipment is still PENDING. Staff. */
export const pickShipmentItem = (id: string): Promise<ShipmentItem> =>
  httpClient({ method: 'PUT', url: `/api/shipment-items/${id}/pick` })

/** Puts a line back, for a mis-scan. Staff. */
export const unpickShipmentItem = (id: string): Promise<ShipmentItem> =>
  httpClient({ method: 'PUT', url: `/api/shipment-items/${id}/unpick` })

/**
 * Returns part or all of a dispatched line to the shelf it was picked from.
 *
 * Admin only, and only once the shipment is DISPATCHED — before that, unpick
 * and cancel already release reserved stock. The invoice is deliberately NOT
 * changed: the dispatch happened and was charged for.
 */
/**
 * Puts some of a dispatched line back on the shelf.
 *
 * `chargeReturn` is opt-in and only honoured when the client has an agreed
 * ITEM_RETURN rate. The shipment's own charge is never rewritten either way —
 * the fee, when there is one, is a separate line. `returnCharge` on the
 * response says what was actually billed, or null.
 */
export const returnShipmentItem = (
  id: string,
  quantity: number,
  options: { reason?: string; chargeReturn?: boolean } = {}
): Promise<ShipmentItem & { returnCharge?: number | null }> =>
  httpClient({
    method: 'POST',
    url: `/api/shipment-items/${id}/return`,
    data: {
      quantity,
      reason: options.reason,
      chargeReturn: options.chargeReturn === true,
    },
  })

/** Quantity / location / tracking id. Admin only. Status is not settable here. */
export const updateShipmentItem = (
  id: string,
  payload: { quantity?: number; trackingId?: string | null }
): Promise<ShipmentItem> =>
  httpClient({ method: 'PUT', url: `/api/shipment-items/${id}`, data: payload })

export default {
  getAllShipments,
  getShipmentsByClientId,
  getShipmentById,
  createShipment,
  updateShipment,
  setShipmentTracking,
  markShipmentReady,
  dispatchShipment,
  cancelShipment,
  reopenShipment,
  deleteShipment,
  pickShipmentItem,
  unpickShipmentItem,
  returnShipmentItem,
  updateShipmentItem,
}

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

export const getShipmentById = (id: string): Promise<Shipment> =>
  httpClient({ method: 'GET', url: `${BASE}/field/id/${id}` })

export const createShipment = (payload: {
  employeeId: string
  clientId: string
  shipmentType: string
  packagingType: string
  courierName: string
  status?: string
  shipmentItems?: {
    productId: string
    sourceLocationId: string
    quantity: number
  }[]
}): Promise<Shipment> =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

/**
 * Commercial and identity details. Admin only, and refused once dispatched.
 * trackingId is NOT settable here — it has its own endpoint below.
 */
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
  updateShipmentItem,
}

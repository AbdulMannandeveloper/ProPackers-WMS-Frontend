import httpClient from '../http-client'

/**
 * FBA consignments.
 *
 * A separate flow from ordinary shipments: goods arrive, are recorded by hand,
 * and leave. No products, no stock, no locations, no scanning — they pass
 * through rather than being stored. The charge is raised when they go, per item.
 */

export type FbaStatus = 'RECEIVED' | 'DISPATCHED' | 'CANCELLED'

export type FbaCategory = {
  id: string
  name: string
  createdAt?: string
}

export type FbaShipment = {
  id: string
  categoryId: string
  clientId: string
  barcode: string
  size: string
  count: number
  status: FbaStatus
  receivedAt: string
  dispatchedAt?: string | null
  notes?: string | null
  category?: FbaCategory
  client?: { id: string; companyName: string }
}

const BASE = '/api/fba-shipments'

// ─── Categories ───────────────────────────────────────────────────────────────
// Staff read them (they must choose one); only an admin decides the list.

export const getCategories = (): Promise<FbaCategory[]> =>
  httpClient({ method: 'GET', url: `${BASE}/categories` })

export const createCategory = (name: string): Promise<FbaCategory> =>
  httpClient({ method: 'POST', url: `${BASE}/categories`, data: { name } })

export const updateCategory = (id: string, name: string): Promise<FbaCategory> =>
  httpClient({ method: 'PUT', url: `${BASE}/categories/${id}`, data: { name } })

export const deleteCategory = (id: string): Promise<{ message: string }> =>
  httpClient({ method: 'DELETE', url: `${BASE}/categories/${id}` })

// ─── Consignments ─────────────────────────────────────────────────────────────

/** Staff see everything; a client sees only their own. Scoped server-side. */
export const getShipments = (): Promise<FbaShipment[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const getShipmentById = (id: string): Promise<FbaShipment> =>
  httpClient({ method: 'GET', url: `${BASE}/${id}` })

/** Records goods arriving. Nothing here is looked up — it is all typed in. */
export const recordArrival = (payload: {
  categoryId: string
  clientId: string
  barcode: string
  size: string
  count: number
  notes?: string
}): Promise<FbaShipment> => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

/** Records goods leaving. This is what raises the charge. */
export const dispatchShipment = (id: string): Promise<FbaShipment> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/dispatch` })

/** Voids a mis-key. Admin only, and refused once dispatched — it is billed. */
export const cancelShipment = (id: string, reason?: string): Promise<FbaShipment> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/cancel`, data: { reason } })

export default {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getShipments,
  getShipmentById,
  recordArrival,
  dispatchShipment,
  cancelShipment,
}

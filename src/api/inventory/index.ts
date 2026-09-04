import httpClient from '../http-client'
import { fetchAllPages, type PaginatedResponse, unwrapList } from '../pagination'

const BASE = '/api/inventory-ledgers'

export type InventoryLedgerEntry = {
  id: string
  productId: string
  userId: string
  movementType: 'CHECKIN' | 'INTERNAL_MOVE' | 'CHECKOUT'
  quantity: number
  fromLocationId?: string | null
  toLocationId?: string | null
  referenceId?: string | null
  notes?: string | null
  timestamp: string
  product?: {
    id: string
    skuCode: string
    productName: string
  }
  user?: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  fromLocation?: {
    id: string
    locationName: string
  } | null
  toLocation?: {
    id: string
    locationName: string
  } | null
}

export const getInventoryLedgersPage = (
  page = 1,
  limit = 50,
): Promise<PaginatedResponse<InventoryLedgerEntry> | InventoryLedgerEntry[]> =>
  httpClient({ method: 'GET', url: `${BASE}/`, params: { page, limit } })

export const getAllInventoryLedgers = (): Promise<InventoryLedgerEntry[]> =>
  fetchAllPages((page, limit) => getInventoryLedgersPage(page, limit))

export const getInventoryLedgerByField = (field: string, value: string): Promise<InventoryLedgerEntry[]> =>
  httpClient({ method: 'GET', url: `${BASE}/${field}/${value}` }).then((r) =>
    unwrapList(r as InventoryLedgerEntry[] | PaginatedResponse<InventoryLedgerEntry>),
  )

export const getInventoryLedgerByClientId = (clientId: string): Promise<InventoryLedgerEntry[]> =>
  httpClient({ method: 'GET', url: `${BASE}/client/${clientId}` }).then((r) =>
    unwrapList(r as InventoryLedgerEntry[] | PaginatedResponse<InventoryLedgerEntry>),
  )

export const getLedgerWithFilters = (params: {
  startDate?: string
  endDate?: string
  productId?: string
  clientId?: string
  movementType?: string
  page?: number
  limit?: number
}): Promise<InventoryLedgerEntry[]> => {
  return fetchAllPages((page, limit) =>
    httpClient({
      method: 'GET',
      url: `${BASE}/filter`,
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
        productId: params.productId,
        clientId: params.clientId,
        movementType: params.movementType,
        page,
        limit,
      },
    }),
  )
}

export const getDailyCheckoutSummary = (date?: string): Promise<any[]> => {
  const query = date ? `?date=${date}` : ''
  return httpClient({ method: 'GET', url: `${BASE}/daily-checkout-summary${query}` })
}

export const createInventoryLedgerEntry = (payload: {
  productId: string
  movementType: 'CHECKIN' | 'INTERNAL_MOVE' | 'CHECKOUT'
  quantity: number
  fromLocationId?: string | null
  toLocationId?: string | null
  referenceId?: string | null
  notes?: string | null
}): Promise<InventoryLedgerEntry> =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

/**
 * Books a whole delivery in at once.
 *
 * One request, one transaction: a pallet of mixed stock either lands entirely
 * or not at all. A line either points at a product that exists or carries the
 * details of one to create.
 */
export const checkInBatch = (payload: {
  toLocationId?: string
  notes?: string
  lines: Array<{
    productId?: string
    newProduct?: {
      clientId: string
      skuCode: string
      productName: string
      barcode?: string | null
      colour?: string | null
      size?: string | null
      weight?: number | null
      thresholdLimit?: number
    }
    quantity: number
    toLocationId?: string
  }>
}): Promise<{ linesReceived: number; productsCreated: number }> =>
  httpClient({ method: 'POST', url: `${BASE}/batch`, data: payload })

export default {
  getAllInventoryLedgers,
  checkInBatch,
  getInventoryLedgersPage,
  getInventoryLedgerByField,
  getInventoryLedgerByClientId,
  getLedgerWithFilters,
  getDailyCheckoutSummary,
  createInventoryLedgerEntry,
}

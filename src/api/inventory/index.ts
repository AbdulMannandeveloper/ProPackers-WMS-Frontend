import httpClient from '../http-client'

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

export const getAllInventoryLedgers = (): Promise<InventoryLedgerEntry[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const getInventoryLedgerByField = (field: string, value: string): Promise<InventoryLedgerEntry[]> =>
  httpClient({ method: 'GET', url: `${BASE}/${field}/${value}` })

export const getInventoryLedgerByClientId = (clientId: string): Promise<InventoryLedgerEntry[]> =>
  httpClient({ method: 'GET', url: `${BASE}/client/${clientId}` })

export const getLedgerWithFilters = (params: {
  startDate?: string
  endDate?: string
  productId?: string
  clientId?: string
  movementType?: string
}): Promise<InventoryLedgerEntry[]> => {
  const query = new URLSearchParams()
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.productId) query.set('productId', params.productId)
  if (params.clientId) query.set('clientId', params.clientId)
  if (params.movementType) query.set('movementType', params.movementType)
  return httpClient({ method: 'GET', url: `${BASE}/filter?${query.toString()}` })
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

export default {
  getAllInventoryLedgers,
  getInventoryLedgerByField,
  getInventoryLedgerByClientId,
  getLedgerWithFilters,
  getDailyCheckoutSummary,
  createInventoryLedgerEntry,
}

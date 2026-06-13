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
  createInventoryLedgerEntry,
}

import httpClient from '../http-client'

const BASE = '/api/stock'

export type StockLevel = {
  id: string
  productId: string
  locationId: string
  currentQuantity: number
  reservedQuantity: number
  arrivedTodayQuantity: number
  product?: {
    id: string
    skuCode: string
    productName: string
    clientId: string
    client?: {
      id: string
      companyName: string
    }
  }
  location?: {
    id: string
    locationName: string
    zone: string
    shelf: string
    bin: string
  }
}

export const getAllStockLevels = (): Promise<StockLevel[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const getStockLevelByProductId = (productId: string): Promise<StockLevel[]> =>
  httpClient({ method: 'GET', url: `${BASE}/product/${productId}` })

export const getStockLevelByLocationId = (locationId: string): Promise<StockLevel[]> =>
  httpClient({ method: 'GET', url: `${BASE}/location/${locationId}` })

export const createStockLevel = (payload: {
  productId: string
  locationId: string
  currentQuantity?: number
  reservedQuantity?: number
  arrivedTodayQuantity?: number
}): Promise<StockLevel> =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const updateStockLevel = (id: string, payload: {
  currentQuantity?: number
  reservedQuantity?: number
  arrivedTodayQuantity?: number
}): Promise<StockLevel> =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const updateStockLevelByProductAndLocation = (
  productId: string,
  locationId: string,
  payload: {
    currentQuantity?: number
    reservedQuantity?: number
    arrivedTodayQuantity?: number
  }
): Promise<StockLevel> =>
  httpClient({
    method: 'PUT',
    url: `${BASE}/product/${productId}/location/${locationId}`,
    data: payload,
  })

export const deleteStockLevel = (id: string): Promise<{ message: string }> =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export default {
  getAllStockLevels,
  getStockLevelByProductId,
  getStockLevelByLocationId,
  createStockLevel,
  updateStockLevel,
  updateStockLevelByProductAndLocation,
  deleteStockLevel,
}

import httpClient from '../http-client'
import { fetchAllPages, type PaginatedResponse, unwrapList } from '../pagination'

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

export const getStockLevelsPage = (
  page = 1,
  limit = 50,
): Promise<PaginatedResponse<StockLevel> | StockLevel[]> =>
  httpClient({ method: 'GET', url: `${BASE}/`, params: { page, limit } })

export const getAllStockLevels = (): Promise<StockLevel[]> =>
  fetchAllPages((page, limit) => getStockLevelsPage(page, limit))

export const getStockLevelByProductId = async (productId: string): Promise<StockLevel[]> => {
  const result = await httpClient<StockLevel[] | PaginatedResponse<StockLevel>>({
    method: 'GET',
    url: `${BASE}/product/${productId}`,
  })
  return unwrapList(result)
}

export const getStockLevelByLocationId = async (locationId: string): Promise<StockLevel[]> => {
  const result = await httpClient<StockLevel[] | PaginatedResponse<StockLevel>>({
    method: 'GET',
    url: `${BASE}/location/${locationId}`,
  })
  return unwrapList(result)
}

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
  getStockLevelsPage,
  getStockLevelByProductId,
  getStockLevelByLocationId,
  createStockLevel,
  updateStockLevel,
  updateStockLevelByProductAndLocation,
  deleteStockLevel,
}

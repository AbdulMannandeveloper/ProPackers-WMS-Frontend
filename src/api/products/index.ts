import httpClient from '../http-client'

const BASE = '/api/products'

export type Product = {
  id: string
  clientId: string
  skuCode: string
  barcode?: string | null
  productName: string
  colour?: string | null
  size?: string | null
  weight?: number | string | null
  thresholdLimit: number
  isDeactivated: boolean
  client?: {
    id: string
    companyName: string
  }
}

export const getAllProducts = (): Promise<Product[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const getProductById = (id: string): Promise<Product> =>
  httpClient({ method: 'GET', url: `${BASE}/${id}` })

export const getProductByField = (field: string, value: string): Promise<Product[]> =>
  httpClient({ method: 'GET', url: `${BASE}/field/${field}/${value}` })

export const createProduct = (payload: {
  clientId: string
  skuCode: string
  barcode?: string | null
  productName: string
  colour?: string | null
  size?: string | null
  weight?: number | null
  thresholdLimit?: number
}): Promise<Product> =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const updateProduct = (id: string, payload: {
  skuCode?: string
  barcode?: string | null
  productName?: string
  colour?: string | null
  size?: string | null
  weight?: number | null
  thresholdLimit?: number
}): Promise<Product> =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const deactivateProduct = (id: string): Promise<{ message: string }> =>
  httpClient({ method: 'PATCH', url: `${BASE}/${id}` })

export const getProductAndStockLevelById = (id: string): Promise<any> =>
  httpClient({ method: 'GET', url: `${BASE}/${id}/stock` })

export default {
  getAllProducts,
  getProductById,
  getProductByField,
  createProduct,
  updateProduct,
  deactivateProduct,
  getProductAndStockLevelById,
}

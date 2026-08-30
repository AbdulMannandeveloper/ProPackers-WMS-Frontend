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

/** Opening stock placed at creation time, recorded as a CHECKIN movement. */
export type InitialStock = {
  locationId: string
  quantity: number
  notes?: string
}

export const createProduct = (payload: {
  clientId: string
  skuCode: string
  barcode?: string | null
  productName: string
  colour?: string | null
  size?: string | null
  weight?: number | null
  thresholdLimit?: number
  initialStock?: InitialStock
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

export const deleteProduct = (id: string): Promise<any> =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

/** Everything the product detail view needs, in one request. */
export type ProductDetail = {
  product: Product
  stockLevels: Array<{
    id: string
    productId: string
    locationId: string
    currentQuantity: number
    reservedQuantity: number
    location?: {
      locationName: string
      zone?: string | null
      shelf?: string | null
      bin?: string | null
    }
  }>
  totalQuantity: number
  recentMovements: Array<{
    id: string
    movementType: 'CHECKIN' | 'CHECKOUT' | 'INTERNAL_MOVE'
    quantity: number
    timestamp: string
    notes?: string | null
    fromLocation?: { locationName: string } | null
    toLocation?: { locationName: string } | null
    user?: { firstName?: string; lastName?: string } | null
  }>
}

export const getProductAndStockLevelById = (id: string): Promise<ProductDetail> =>
  httpClient({ method: 'GET', url: `${BASE}/${id}/stock` })

/** A scan resolves to one or more products — see lookupByBarcodeOrSku. */
export type ScanMatch = Product & {
  client?: { id: string; companyName: string }
  stockLevels?: {
    id: string
    currentQuantity: number
    reservedQuantity: number
    locationId: string
    location?: { id: string; locationName: string; materializedPath?: string | null }
  }[]
}

export type ScanLookup = {
  matches: ScanMatch[]
  /** Which column matched. A SKU hit can be ambiguous across clients. */
  matchedOn: 'barcode' | 'skuCode' | null
}

/**
 * Resolve a scanned code. Returns every match: `barcode` is globally unique, but
 * `skuCode` is unique only within a client, so two clients can share one and the
 * operator has to choose. 404 when nothing matches.
 */
export const lookupByCode = (value: string): Promise<ScanLookup> =>
  httpClient({ method: 'GET', url: `${BASE}/lookup/barcode/${encodeURIComponent(value)}` })

/** Binds a scanned code to a product that did not have one. */
export const attachBarcode = (id: string, barcode: string): Promise<Product> =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: { barcode } })

export default {
  lookupByCode,
  attachBarcode,
  getAllProducts,
  getProductById,
  getProductByField,
  createProduct,
  updateProduct,
  deactivateProduct,
  deleteProduct,
  getProductAndStockLevelById,
}

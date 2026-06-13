import httpClient from '../http-client'

export type ShipmentItem = {
  id: string
  shipmentId: string
  productId: string
  sourceLocationId: string
  quantity: number
  status: 'PENDING' | 'PICKED' | 'READY'
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
  status: 'PENDING' | 'READY_FOR_DISPATCH' | 'DISPATCHED'
  packagingType: string
  courierName: string
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

export const updateShipment = (id: string, payload: Partial<Shipment>): Promise<Shipment> =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const dispatchShipment = (id: string): Promise<{ message: string }> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/dispatch` })

export const deleteShipment = (id: string): Promise<{ message: string }> =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export const updateShipmentItem = (
  id: string,
  payload: {
    status?: 'PENDING' | 'PICKED' | 'READY'
    quantity?: number
  }
): Promise<ShipmentItem> =>
  httpClient({ method: 'PUT', url: `/api/shipment-items/${id}`, data: payload })

export default {
  getAllShipments,
  getShipmentsByClientId,
  getShipmentById,
  createShipment,
  updateShipment,
  dispatchShipment,
  deleteShipment,
  updateShipmentItem,
}

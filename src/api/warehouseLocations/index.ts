import httpClient from '../http-client'

const LOCATION_BASE = '/api/warehouse-locations'
const CLASS_BASE = '/api/warehouse-location-classes'

export type WarehouseLocationClass = {
  id: string
  name: string
  description?: string | null
  parentClassId?: string | null
}

export type WarehouseLocation = {
  id: string
  locationName: string
  locationClassId: string
  parentLocationId?: string | null
  materializedPath?: string | null
  locationClass?: WarehouseLocationClass
  parentLocation?: {
    id: string
    locationName: string
  } | null
}

export const createWarehouseLocation = (payload: {
  locationName: string
  locationClassId: string
  parentLocationId?: string | null
}) => httpClient({ method: 'POST', url: `${LOCATION_BASE}/`, data: payload })

export const getAllWarehouseLocations = (): Promise<WarehouseLocation[]> =>
  httpClient({ method: 'GET', url: `${LOCATION_BASE}/` })

export const getWarehouseLocationByField = (field: string, value: string) =>
  httpClient({ method: 'GET', url: `${LOCATION_BASE}/${field}/${value}` })

export const updateWarehouseLocation = (id: string, payload: {
  locationName?: string
  locationClassId?: string
  parentLocationId?: string | null
}) => httpClient({ method: 'PUT', url: `${LOCATION_BASE}/${id}`, data: payload })

export const deleteWarehouseLocation = (id: string) =>
  httpClient({ method: 'DELETE', url: `${LOCATION_BASE}/${id}` })

export const createWarehouseLocationClass = (payload: {
  name: string
  description?: string
  parentClassId?: string | null
}) => httpClient({ method: 'POST', url: `${CLASS_BASE}/`, data: payload })

export const getAllWarehouseLocationClasses = (): Promise<WarehouseLocationClass[]> =>
  httpClient({ method: 'GET', url: `${CLASS_BASE}/` })

export const updateWarehouseLocationClass = (id: string, payload: {
  name?: string
  description?: string
  parentClassId?: string | null
}) => httpClient({ method: 'PUT', url: `${CLASS_BASE}/${id}`, data: payload })

export const deleteWarehouseLocationClass = (id: string) =>
  httpClient({ method: 'DELETE', url: `${CLASS_BASE}/${id}` })

export default {
  createWarehouseLocation,
  getAllWarehouseLocations,
  getWarehouseLocationByField,
  updateWarehouseLocation,
  deleteWarehouseLocation,
  createWarehouseLocationClass,
  getAllWarehouseLocationClasses,
  updateWarehouseLocationClass,
  deleteWarehouseLocationClass,
}

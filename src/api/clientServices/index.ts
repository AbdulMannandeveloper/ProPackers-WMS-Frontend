import httpClient from '../http-client'
import type { Service } from '../types'

const BASE = '/api/client-services'

export const addClientService = (payload: { clientId: string; serviceId: string; chargedPrice?: number; unit?: string }) =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllClientServices = () => httpClient({ method: 'GET', url: `${BASE}/` })

export const getClientServicesByClientId = (clientId: string) =>
  httpClient({ method: 'GET', url: `${BASE}/client/${clientId}` })

export const getClientServicesByServiceId = (serviceId: string) =>
  httpClient({ method: 'GET', url: `${BASE}/service/${serviceId}` })

export const updateClientService = (id: string, payload: { chargedPrice?: number; unit?: string }) =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const deleteClientService = (id: string) => httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export default { addClientService, getAllClientServices, getClientServicesByClientId, getClientServicesByServiceId, updateClientService, deleteClientService }

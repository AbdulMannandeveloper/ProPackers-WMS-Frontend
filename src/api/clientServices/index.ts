import httpClient from '../http-client'

const BASE = '/api/client-services'

export const addClientService = (payload: { clientId: string; serviceId: string; chargedPrice?: number; unit?: string }) =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllClientServices = () => httpClient({ method: 'GET', url: `${BASE}/` })

export const getClientServicesByClientId = async (clientId: string) => {
  const all = await getAllClientServices()
  if (!Array.isArray(all)) return []
  return all.filter((entry: any) => entry?.clientId === clientId)
}

export const getClientServicesByServiceId = async (serviceId: string) => {
  const all = await getAllClientServices()
  if (!Array.isArray(all)) return []
  return all.filter((entry: any) => entry?.serviceId === serviceId)
}

export const updateClientService = (id: string, payload: { chargedPrice?: number; unit?: string }) =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const deleteClientService = (id: string) => httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export default { addClientService, getAllClientServices, getClientServicesByClientId, getClientServicesByServiceId, updateClientService, deleteClientService }

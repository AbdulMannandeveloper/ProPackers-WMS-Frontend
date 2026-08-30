import httpClient from '../http-client'

const BASE = '/api/client-services'

export const addClientService = (payload: { clientId: string; serviceId: string; chargedPrice?: number; unit?: string }) =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllClientServices = () => httpClient({ method: 'GET', url: `${BASE}/` })

export type ClientServiceRate = {
  id: string
  clientId: string
  serviceId: string
  chargedPrice: number | string
  unit?: string
  service?: { id: string; description: string; unit: string; code?: string | null }
}

/**
 * The rates agreed with one client. Hits the dedicated endpoint rather than
 * pulling every client's rates and filtering in the browser.
 */
export const getClientServicesByClientId = async (
  clientId: string
): Promise<ClientServiceRate[]> => {
  const rows = await httpClient<ClientServiceRate[]>({
    method: 'GET',
    url: `${BASE}/client/${clientId}`,
  })
  return Array.isArray(rows) ? rows : []
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

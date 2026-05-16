import httpClient from '../http-client'
import type { Client } from '../types'

const BASE = '/api/clients'

export const addClient = (payload: { adminId: string; companyName: string; contactName: string; email: string; phone?: string; address?: string }) => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllClients = (): Promise<Client[]> => httpClient({ method: 'GET', url: `${BASE}/` })

export const getClientById = (id: string): Promise<Client> => httpClient({ method: 'GET', url: `${BASE}/${id}` })

export default { addClient, getAllClients, getClientById }

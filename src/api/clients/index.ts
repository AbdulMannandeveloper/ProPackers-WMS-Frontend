import httpClient from '../http-client'
import type { Client } from '../types'

const BASE = '/api/clients'

export const addClient = (payload: { adminId: string; companyName: string; contactName: string; email: string; mobile?: string; address?: string }) => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllClients = (): Promise<Client[]> => httpClient({ method: 'GET', url: `${BASE}/` })

/** Slim id + companyName list, readable by employees for product attribution. */
export const getClientLookup = (): Promise<{ id: string; companyName: string }[]> => httpClient({ method: 'GET', url: `${BASE}/lookup` })

/** The signed-in client's own business record (client portal). */
export const getMyClient = (): Promise<Client> => httpClient({ method: 'GET', url: `${BASE}/me` })

export const getClientById = (id: string): Promise<Client> => httpClient({ method: 'GET', url: `${BASE}/${id}` })

export const updateClient = (id: string, payload: { companyName?: string; contactName?: string; email?: string; mobile?: string; address?: string }) => httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const deleteClient = (id: string) => httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export default { addClient, getAllClients, getClientLookup, getMyClient, getClientById, updateClient, deleteClient }

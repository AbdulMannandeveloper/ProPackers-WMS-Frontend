import httpClient from '../http-client'
import type { Service } from '../types'

const BASE = '/api/services'

export const createService = (payload: { description: string; ideaPrice: number; unit: string }) => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllServices = (): Promise<Service[]> => httpClient({ method: 'GET', url: `${BASE}/` })

export const getServiceById = (id: string): Promise<Service> => httpClient({ method: 'GET', url: `${BASE}/${id}` })

export const updateService = (id: string, payload: { description?: string; ideaPrice?: number; unit?: string }) => httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const deleteService = (id: string) => httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export default { createService, getAllServices, getServiceById, updateService, deleteService }

import httpClient from '../http-client'
import type { Service } from '../types'

const BASE = '/api/services'

export const createService = (payload: { description: string; ideaPrice: number; unit: string }) => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllServices = (): Promise<Service[]> => httpClient({ method: 'GET', url: `${BASE}/` })

export default { createService, getAllServices }

import httpClient from '../http-client'

const BASE = '/api/holidays'

export type Holiday = {
  id: string
  name: string
  startDate: string
  endDate?: string | null
  createdAt?: string
  updatedAt?: string
}

export const createHoliday = (payload: {
  name: string
  startDate: string
  endDate?: string
}): Promise<Holiday> =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllHolidays = (): Promise<Holiday[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const getHolidayById = (id: string): Promise<Holiday> =>
  httpClient({ method: 'GET', url: `${BASE}/${id}` })

export const updateHoliday = (id: string, payload: {
  name?: string
  startDate?: string
  endDate?: string
}): Promise<Holiday> =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const deleteHoliday = (id: string): Promise<any> =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export default {
  createHoliday,
  getAllHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday,
}

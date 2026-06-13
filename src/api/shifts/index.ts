import httpClient from '../http-client'

const BASE = '/api/shifts'

export type Shift = {
  id: string
  name: string
  startTime: string
  endTime: string
  gracePeriodMins: number
}

export const getAllShifts = (): Promise<Shift[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const createShift = (payload: {
  name: string
  startTime: string
  endTime: string
  gracePeriodMins: number
}): Promise<Shift> => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const updateShift = (id: string, payload: {
  name?: string
  startTime?: string
  endTime?: string
  gracePeriodMins?: number
}): Promise<Shift> => httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export default {
  getAllShifts,
  createShift,
  updateShift,
}

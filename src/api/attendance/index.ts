import httpClient from '../http-client'

const BASE = '/api/attendance'

export type AttendanceLog = {
  id: string
  userId: string
  loginTimestamp: string
  logoutTimestamp?: string | null
  status: string
  date: string
  user?: {
    id: string
    firstName: string
    lastName: string
    username?: string | null
    email: string
  }
}

export const createAttendanceLog = (payload: {
  userId: string
  loginTimestamp: string
  date: string
}) => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllAttendanceLogs = (): Promise<AttendanceLog[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const getAttendanceLogByField = (field: string, value: string): Promise<AttendanceLog[]> =>
  httpClient({ method: 'GET', url: `${BASE}/${field}/${value}` })

export const updateAttendanceLog = (id: string, payload: {
  loginTimestamp?: string
  logoutTimestamp?: string | null
  status?: string
  date?: string
}) => httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const updateLogoutTimestamp = (id: string, logoutTimestamp: string) =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}/logout`, data: { logoutTimestamp } })

export const deleteAttendanceLog = (id: string) =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export default {
  createAttendanceLog,
  getAllAttendanceLogs,
  getAttendanceLogByField,
  updateAttendanceLog,
  updateLogoutTimestamp,
  deleteAttendanceLog,
}

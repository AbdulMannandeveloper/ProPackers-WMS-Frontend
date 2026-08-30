import httpClient from '../http-client'
import { fetchAllPages, type PaginatedResponse, unwrapList } from '../pagination'

const BASE = '/api/attendance'

export type AttendanceLog = {
  id: string
  userId: string
  loginTimestamp?: string | null
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

export const getAttendanceLogsPage = (
  page = 1,
  limit = 50,
): Promise<PaginatedResponse<AttendanceLog> | AttendanceLog[]> =>
  httpClient({ method: 'GET', url: `${BASE}/`, params: { page, limit } })

export const getAllAttendanceLogs = (): Promise<AttendanceLog[]> =>
  fetchAllPages((page, limit) => getAttendanceLogsPage(page, limit))

export const getAttendanceLogByField = (field: string, value: string): Promise<AttendanceLog[]> =>
  httpClient({ method: 'GET', url: `${BASE}/${field}/${value}` }).then((r) =>
    unwrapList(r as AttendanceLog[] | PaginatedResponse<AttendanceLog>),
  )

export const updateAttendanceLog = (id: string, payload: {
  loginTimestamp?: string | null
  logoutTimestamp?: string | null
  status?: string
  date?: string
}) => httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const updateLogoutTimestamp = (id: string, logoutTimestamp: string) =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}/logout`, data: { logoutTimestamp } })

export const deleteAttendanceLog = (id: string) =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export const archiveAndCleanup = (): Promise<{ message: string; processed: any[] }> =>
  httpClient({ method: 'POST', url: `${BASE}/archive-and-cleanup` })

export const markLeave = (payload: {
  userId: string
  date: string
  forceOverwrite?: boolean
}): Promise<AttendanceLog> =>
  httpClient({ method: 'POST', url: `${BASE}/mark-leave`, data: payload })

export const unmarkLeave = (payload: {
  userId: string
  date: string
}): Promise<AttendanceLog> =>
  httpClient({ method: 'POST', url: `${BASE}/unmark-leave`, data: payload })

export type AttendanceMonthStats = {
  month: string
  source?: 'archive' | 'live'
  totalDaysPresent: number
  totalOnTimeDays: number
  totalLateArrivals: number
  totalLeaveDays: number
  totalHolidayDays: number
  totalHoursWorked: number
}

export type AttendanceAnalytics = {
  user: {
    id: string
    firstName?: string | null
    lastName?: string | null
    email: string
    role?: string
  }
  filters: { year: number | null; month: number | null }
  allTime: AttendanceMonthStats & { monthsCovered: number }
  period: AttendanceMonthStats & { monthsCovered: number }
  months: AttendanceMonthStats[]
  history: AttendanceMonthStats[]
  dailyLogs: Array<{
    id: string
    date: string
    status: string
    loginTimestamp?: string | null
    logoutTimestamp?: string | null
  }>
}

export const getEmployeeAttendanceAnalytics = (
  userId: string,
  params?: { year?: number | string; month?: number | string },
): Promise<AttendanceAnalytics> =>
  httpClient({
    method: 'GET',
    url: `${BASE}/analytics/${userId}`,
    params: {
      ...(params?.year ? { year: params.year } : {}),
      ...(params?.month ? { month: params.month } : {}),
    },
  })

export default {
  createAttendanceLog,
  getAllAttendanceLogs,
  getAttendanceLogsPage,
  getAttendanceLogByField,
  updateAttendanceLog,
  updateLogoutTimestamp,
  deleteAttendanceLog,
  archiveAndCleanup,
  markLeave,
  unmarkLeave,
  getEmployeeAttendanceAnalytics,
}

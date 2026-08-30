import httpClient from '../http-client'
import { fetchAllPages, type PaginatedResponse } from '../pagination'

const BASE = '/api/audit-logs'

export type AuditLogEntry = {
  id: string
  userId: string
  action: string
  details: string
  timestamp: string
  user?: {
    firstName: string
    lastName: string
    role: string
  }
}

export const getAuditLogsPage = (
  page = 1,
  limit = 50,
): Promise<PaginatedResponse<AuditLogEntry> | AuditLogEntry[]> =>
  httpClient({ method: 'GET', url: `${BASE}/`, params: { page, limit } })

export const getAllAuditLogs = (): Promise<AuditLogEntry[]> =>
  fetchAllPages((page, limit) => getAuditLogsPage(page, limit))

export default {
  getAllAuditLogs,
  getAuditLogsPage,
}

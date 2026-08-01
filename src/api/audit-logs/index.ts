import httpClient from '../http-client'

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

export const getAllAuditLogs = (): Promise<AuditLogEntry[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export default {
  getAllAuditLogs,
}

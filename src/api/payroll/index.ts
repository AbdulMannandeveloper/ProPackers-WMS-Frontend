import httpClient from '../http-client'

const BASE = '/api/payroll'

export type Fine = {
  id: string
  userId: string
  reason: string
  amount: string | number
  date: string
  cancelled: boolean
}

export type Bonus = {
  id: string
  userId: string
  reason: string
  amount: string | number
  date: string
}

export type SalaryBreakdown = {
  userId: string
  employeeId: string
  employeeName: string
  employeeUniqueNumber: string
  jobTitle?: string | null
  baseSalary: number
  fines: Fine[]
  bonuses: Bonus[]
  totalFines: number
  totalBonuses: number
  netPay: number
  lateArrivalsCount: number
  daysPresent: number
  hoursWorked: number
  monthYear: string
}

export const setBaseSalary = (employeeId: string, amount: number): Promise<any> =>
  httpClient({ method: 'PUT', url: `${BASE}/employees/${employeeId}/base-salary`, data: { amount } })

export const createFineRule = (payload: { lateMinutes: number; fineType: string; amount: number }): Promise<any> =>
  httpClient({ method: 'POST', url: `${BASE}/rules`, data: payload })

export const getActiveFineRule = (): Promise<any> =>
  httpClient({ method: 'GET', url: `${BASE}/rules/active` })

export const createFine = (payload: { userId: string; amount: number; reason: string; date?: string }): Promise<Fine> =>
  httpClient({ method: 'POST', url: `${BASE}/fines`, data: payload })

export const toggleCancelFine = (fineId: string): Promise<Fine> =>
  httpClient({ method: 'PATCH', url: `${BASE}/fines/${fineId}/cancel` })

export const createBonus = (payload: { userId: string; amount: number; reason: string; date?: string }): Promise<Bonus> =>
  httpClient({ method: 'POST', url: `${BASE}/bonuses`, data: payload })

export const getMySummary = (monthYear?: string): Promise<SalaryBreakdown> =>
  httpClient({ method: 'GET', url: `${BASE}/my-summary`, params: { monthYear } })

export const getSummary = (monthYear?: string): Promise<SalaryBreakdown[]> =>
  httpClient({ method: 'GET', url: `${BASE}/summary`, params: { monthYear } })

export const finalizePayroll = (monthYear: string): Promise<any> =>
  httpClient({ method: 'POST', url: `${BASE}/finalize`, data: { monthYear } })

export default {
  setBaseSalary,
  createFineRule,
  getActiveFineRule,
  createFine,
  toggleCancelFine,
  createBonus,
  getMySummary,
  getSummary,
  finalizePayroll,
}

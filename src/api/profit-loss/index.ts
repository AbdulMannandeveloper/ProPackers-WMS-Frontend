import httpClient from '../http-client'

const BASE = '/api/profit-loss'

export type PLSummary = {
  monthYear: string
  totalEarnings: number
  totalExpenses: number
  netProfit: number
}

export type PLTrend = {
  month: string
  monthDate: string
  revenue: number
  expenses: number
  profit: number
}

export type ClientProfitability = {
  clientId: string
  companyName: string
  revenue: number
}

export const getPLSummary = (monthYear?: string): Promise<PLSummary> =>
  httpClient({ method: 'GET', url: `${BASE}/summary`, params: { monthYear } })

export const getPLTrends = (months?: number): Promise<PLTrend[]> =>
  httpClient({ method: 'GET', url: `${BASE}/trends`, params: { months } })

export const getClientProfitability = (monthYear?: string): Promise<ClientProfitability[]> =>
  httpClient({ method: 'GET', url: `${BASE}/client-profitability`, params: { monthYear } })

export default {
  getPLSummary,
  getPLTrends,
  getClientProfitability,
}

import httpClient from '../http-client'

const BASE = '/api/expenses'

export type ExpenseCategory = {
  id: string
  categoryName: string
  isSystemGenerated: boolean
}

export type Expense = {
  id: string
  categoryId: string
  category?: ExpenseCategory
  categoryName?: string
  amount: string | number
  description?: string | null
  date: string
  receiptImageUrl?: string | null
}

export const createCategory = (categoryName: string): Promise<ExpenseCategory> =>
  httpClient({ method: 'POST', url: `${BASE}/categories`, data: { categoryName } })

export const getAllCategories = (): Promise<ExpenseCategory[]> =>
  httpClient({ method: 'GET', url: `${BASE}/categories` })

export const createExpense = (payload: {
  categoryId: string
  amount: number
  description?: string
  date: string
  receiptImageUrl?: string | null
}): Promise<Expense> =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllExpenses = (params?: { categoryId?: string; startDate?: string; endDate?: string }): Promise<Expense[]> =>
  httpClient({ method: 'GET', url: `${BASE}/`, params })

export const deleteExpense = (id: string): Promise<any> =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export const uploadReceipt = (file: File): Promise<{ url: string; originalName: string }> => {
  const formData = new FormData()
  formData.append('receipt', file)
  return httpClient({
    method: 'POST',
    url: `${BASE}/upload`,
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

export default {
  createCategory,
  getAllCategories,
  createExpense,
  getAllExpenses,
  deleteExpense,
  uploadReceipt,
}

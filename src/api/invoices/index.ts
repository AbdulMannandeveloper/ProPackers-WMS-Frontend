import httpClient from '../http-client'

export type InvoiceStatus = 'DRAFT' | 'APPROVED' | 'PAID'
export type LineItemType = 'AUTOMATED_SERVICE' | 'MANUAL_CHARGE'

export type InvoiceLineItem = {
  id: string
  invoiceId: string
  itemType: LineItemType
  dateOfService: string
  description: string
  quantity: number | string
  unitPrice: number | string
  totalPrice: number | string
  clientServiceId?: string | null
  clientService?: {
    id: string
    service?: {
      id: string
      description: string
      unit: string
    }
  } | null
}

export type MonthlyInvoice = {
  id: string
  clientId: string
  billingPeriod: string
  totalAmount: number | string
  status: InvoiceStatus
  pdfLink?: string | null
  paidAt?: string | null
  paymentMethod?: string | null
  paymentReference?: string | null
  createdAt: string
  updatedAt: string
  approvedAt?: string | null
  client?: {
    id: string
    companyName: string
    contactName: string
    email: string
  }
  lineItems?: InvoiceLineItem[]
}

const BASE = '/api/monthly-invoices'

export const getAllInvoices = (): Promise<MonthlyInvoice[]> =>
  httpClient({ method: 'GET', url: `${BASE}/` })

export const getInvoicesByClientId = (clientId: string): Promise<MonthlyInvoice[]> =>
  httpClient({ method: 'GET', url: `${BASE}/client/${clientId}` })

export const getInvoiceById = (id: string): Promise<MonthlyInvoice> =>
  httpClient({ method: 'GET', url: `${BASE}/${id}` })

export const createInvoice = (payload: { clientId: string }): Promise<MonthlyInvoice> =>
  httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

/** APPROVED -> PAID. Method and reference are optional but worth capturing. */
export const markInvoicePaid = (
  id: string,
  payload: { paymentMethod?: string; paymentReference?: string } = {}
): Promise<MonthlyInvoice> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/pay`, data: payload })

export const approveInvoice = (id: string): Promise<MonthlyInvoice> =>
  httpClient({ method: 'POST', url: `${BASE}/${id}/approve` })

export const deleteInvoice = (id: string): Promise<{ message: string }> =>
  httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export const getLineItems = (invoiceId: string): Promise<InvoiceLineItem[]> =>
  httpClient({ method: 'GET', url: `${BASE}/${invoiceId}/line-items` })

export const createLineItem = (
  invoiceId: string,
  payload: {
    description: string
    quantity: number
    unitPrice: number
    dateOfService?: string
  }
): Promise<InvoiceLineItem> =>
  httpClient({ method: 'POST', url: `${BASE}/${invoiceId}/line-items`, data: payload })

export const deleteLineItem = (invoiceId: string, lineItemId: string): Promise<{ message: string }> =>
  httpClient({ method: 'DELETE', url: `${BASE}/${invoiceId}/line-items/${lineItemId}` })

export default {
  getAllInvoices,
  getInvoicesByClientId,
  getInvoiceById,
  createInvoice,
  approveInvoice,
  markInvoicePaid,
  deleteInvoice,
  getLineItems,
  createLineItem,
  deleteLineItem,
}

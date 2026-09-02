export interface User {
  id: string
  username?: string | null
  firstName: string
  lastName: string
  email: string
  role: 'admin' | 'employee' | 'client'
  isActive: boolean
}

export interface Client {
  id: string
  userId: string
  clientUniqueNumber: string
  companyName: string
  contactName: string
  email: string
  mobile?: string | null
  address?: string | null
}

export interface Employee {
  id: string
  userId: string
  employeeUniqueNumber: string
  jobTitle?: string | null
  email?: string | null
  /** Employment details. Admin-only to read and write — NI numbers and DOBs. */
  nationalInsuranceNumber?: string | null
  dateOfBirth?: string | null
  wageRate?: number | string | null
  address?: string | null
  /** Read-only here: Payroll owns it, and it is what payroll multiplies out. */
  baseSalary?: number | string | null
  user?: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
}

export interface Service {
  id: string
  description: string
  ideaPrice: number
  unit: string
}

export interface ApiListResponse<T> extends Array<T> {}

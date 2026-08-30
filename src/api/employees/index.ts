import httpClient from '../http-client'
import type { Employee } from '../types'

const BASE = '/api/employees'

export const addEmployee = (payload: { adminId: string; firstName: string; lastName: string; email: string }) => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

/** Admin only, and carries NI numbers and salaries. Use the lookup for pickers. */
export const getAllEmployees = (): Promise<Employee[]> => httpClient({ method: 'GET', url: `${BASE}/` })

/**
 * Names and ids only, for choosing an operator. Open to staff, where
 * getAllEmployees is admin-only — so an employee raising a shipment gets a list
 * instead of a 403, and nobody's National Insurance number goes to a browser to
 * render a dropdown.
 */
export const getEmployeeLookup = (): Promise<
  { id: string; firstName: string | null; lastName: string | null }[]
> => httpClient({ method: 'GET', url: `${BASE}/lookup` })

export const getEmployeeById = (id: string): Promise<Employee> => httpClient({ method: 'GET', url: `${BASE}/${id}` })

export default { addEmployee, getAllEmployees, getEmployeeLookup, getEmployeeById }

import httpClient from '../http-client'
import type { Employee } from '../types'

const BASE = '/api/employees'

export const addEmployee = (payload: { adminId: string; firstName: string; lastName: string; email: string }) => httpClient({ method: 'POST', url: `${BASE}/`, data: payload })

export const getAllEmployees = (): Promise<Employee[]> => httpClient({ method: 'GET', url: `${BASE}/` })

export const getEmployeeById = (id: string): Promise<Employee> => httpClient({ method: 'GET', url: `${BASE}/${id}` })

export default { addEmployee, getAllEmployees, getEmployeeById }

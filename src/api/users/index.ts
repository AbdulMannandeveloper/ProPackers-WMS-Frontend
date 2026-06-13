import httpClient from '../http-client'
import type { User } from '../types'

const BASE = '/api/users'

export const getAllUsers = (): Promise<User[]> => httpClient({ method: 'GET', url: `${BASE}/` })

export const getUserByEmail = (email: string): Promise<User> => httpClient({ method: 'GET', url: `${BASE}/${encodeURIComponent(email)}` })

export const updateUser = (id: string, payload: Partial<User>) =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export const deleteUser = (id: string) => httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export default { getAllUsers, getUserByEmail, updateUser, deleteUser }

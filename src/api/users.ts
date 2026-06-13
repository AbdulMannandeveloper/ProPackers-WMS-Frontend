import httpClient from './http-client'
import { useAuthStore } from '@/stores/auth'

const BASE = '/api/users'

export const getAllUsers = () => httpClient({ method: 'GET', url: `${BASE}/` })

export const deleteUser = (id: string) => httpClient({ method: 'DELETE', url: `${BASE}/${id}` })

export const addUser = (payload: { firstName: string; lastName: string; username?: string; email: string; role: string }) => {
  // include current logged-in user id as adminId for server-side validation
  const adminId = useAuthStore.getState().userId
  return httpClient({ method: 'POST', url: `${BASE}/add`, data: { ...payload, adminId } })
}

export const updateUser = (id: string, payload: { firstName?: string; lastName?: string; username?: string; email?: string; role?: string; isActive?: boolean }) =>
  httpClient({ method: 'PUT', url: `${BASE}/${id}`, data: payload })

export default { getAllUsers, deleteUser, addUser, updateUser }

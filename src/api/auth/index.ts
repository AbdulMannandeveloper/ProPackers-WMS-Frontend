import httpClient from '../http-client'

const BASE = '/api/auth'

export const login = (payload: { identifier: string; password: string }): Promise<{ userId: string }> =>
  httpClient({ method: 'POST', url: `${BASE}/login`, data: payload })

export const verifyOtp = (payload: { userId: string; otp: string }): Promise<{
  verified: boolean
  token: string
  userId: string
  firstName?: string
  lastName?: string
  username?: string | null
  email?: string
  role?: string
  isActive?: boolean
}> =>
  httpClient({ method: 'POST', url: `${BASE}/verify-otp`, data: payload })

export const requestAdminSignupOtp = (
  payload: { firstName: string; lastName: string; username?: string; email: string },
): Promise<{ message: string; userId: string; email: string }> =>
  httpClient({ method: 'POST', url: `${BASE}/admin-signup/request-otp`, data: payload })

export const inviteUserByAdmin = (payload: { adminId: string; username?: string; email: string; firstName: string; lastName: string; role: string }) =>
  httpClient({ method: 'POST', url: `${BASE}/admin/users/invite`, data: payload })

export const forgotPassword = (payload: { email: string }) => httpClient({ method: 'POST', url: `${BASE}/forgot-password`, data: payload })

export const setupPassword = (
  payload: { token: string; password: string },
): Promise<{ message: string; completed: boolean; userId: string }> =>
  httpClient({ method: 'POST', url: `${BASE}/setup-password`, data: payload })

export const getSetupPasswordPreview = (
  token: string,
): Promise<{
  userId: string
  firstName: string
  lastName: string
  username?: string | null
  email: string
  role: string
}> => httpClient({ method: 'GET', url: `${BASE}/setup-password/preview`, params: { token } })

export const resetPasswordForUser = (payload: { adminId: string; userId: string }) =>
  httpClient({ method: 'POST', url: `${BASE}/admin/users/reset-password`, data: payload })

export default {
  login,
  verifyOtp,
  requestAdminSignupOtp,
  inviteUserByAdmin,
  forgotPassword,
  setupPassword,
  getSetupPasswordPreview,
  resetPasswordForUser,
}

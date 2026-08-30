import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

import { useAuthStore } from '@/stores/auth'

/**
 * Empty base URL means same-origin relative requests, which is how production
 * serves this: nginx hands back the app and proxies /api to the API. Keeping
 * them on one origin is what lets the session refresh cookie stay SameSite=Lax
 * rather than SameSite=None, and removes the CORS preflight from every call.
 *
 * In development Vite serves on :5173 and the API on :8000, so the env var
 * points across. Set it to "" for a same-origin build.
 */
export const AXIOS_INSTANCE = axios.create({
  baseURL: import.meta.env.VITE_BASE_API_URL ?? '',
  // The refresh cookie is httpOnly; the browser only sends it when asked to.
  withCredentials: true,
})

const handleGlobalHttpError = (_error: AxiosError): void => {
  // Intentionally no-op for now.
  // Add global routing/notifications here when error pages are introduced.
}

AXIOS_INSTANCE.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token

  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status

    // Clear a stale/invalid session so the app falls back to the login screen.
    if (status === 401 && useAuthStore.getState().token) {
      useAuthStore.getState().logout()
    }

    const shouldHandleGlobally =
      status === undefined || [500, 502, 503, 504].includes(status)

    if (shouldHandleGlobally) {
      handleGlobalHttpError(error)
    }

    return Promise.reject(error)
  },
)

export const httpClient = async <T = unknown>(
  config: AxiosRequestConfig,
): Promise<T> => {
  const response: AxiosResponse<T> = await AXIOS_INSTANCE.request<T>(config)

  return response.data
}

export default httpClient

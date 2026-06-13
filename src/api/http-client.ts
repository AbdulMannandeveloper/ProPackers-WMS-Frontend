import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

import { useAuthStore } from '@/stores/auth'

export const AXIOS_INSTANCE = axios.create({
  baseURL: import.meta.env.VITE_BASE_API_URL || 'http://localhost:8000',
})

const handleGlobalHttpError = (_error: AxiosError): void => {
  // Intentionally no-op for now.
  // Add global routing/notifications here when error pages are introduced.
}

AXIOS_INSTANCE.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  const userId = useAuthStore.getState().userId

  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Token ${token}`
    if (userId) {
      config.headers['x-user-id'] = userId
    }
  }

  return config
})

AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status

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

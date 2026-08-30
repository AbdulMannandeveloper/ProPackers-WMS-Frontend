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

/**
 * Silent refresh.
 *
 * The access token lives ~15 minutes in memory, so a 401 during normal use
 * usually means it simply expired — not that the session ended. The httpOnly
 * refresh cookie is still there, so we exchange it for a new access token and
 * replay the request. Only when that fails is the session genuinely over.
 *
 * Concurrent 401s share one in-flight refresh. Without that, a page firing five
 * parallel requests would fire five refreshes, and the losers would replay with
 * a token that had already been superseded.
 */
let refreshInFlight: Promise<string | null> | null = null

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    try {
      const { data } = await axios.post<{ token: string; role?: string; userId?: string }>(
        '/api/auth/refresh',
        {},
        { baseURL: AXIOS_INSTANCE.defaults.baseURL, withCredentials: true },
      )
      const store = useAuthStore.getState()
      store.setToken(data.token)
      if (data.userId) store.setUserId(data.userId)
      if (data.role) store.setRole(data.role)
      return data.token
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined

    if (
      status === 401 &&
      original &&
      !original._retried &&
      // Refreshing a failed refresh would loop.
      !String(original.url ?? '').includes('/auth/refresh')
    ) {
      original._retried = true
      const token = await refreshAccessToken()
      if (token) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${token}` }
        return AXIOS_INSTANCE.request(original)
      }
      // The refresh failed: revoked, expired, or signed out elsewhere.
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

/** Called on boot: recovers a session from the refresh cookie after a reload. */
export const restoreSession = () => refreshAccessToken()

export const httpClient = async <T = unknown>(
  config: AxiosRequestConfig,
): Promise<T> => {
  const response: AxiosResponse<T> = await AXIOS_INSTANCE.request<T>(config)

  return response.data
}

export default httpClient

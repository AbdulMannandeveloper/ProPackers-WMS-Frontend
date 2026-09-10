import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

import { useRequestStore } from '@/lib/requests'
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
 * replay the request.
 *
 * Concurrent 401s share one in-flight refresh. Without that, a page firing five
 * parallel requests would fire five refreshes, and the losers would replay with
 * a token that had already been superseded.
 */

/**
 * Why a refresh did not produce a token — because the two reasons call for
 * opposite responses, and this used to collapse them into `null`.
 *
 * A refused cookie means the session is over and the user should be sent to the
 * login screen. A request that never arrived means nothing about the session at
 * all: the lift, the tunnel, the flaky hotspot. Signing someone out for that is
 * how "I was logged out mid-shift" happens on a warehouse floor with patchy
 * coverage — and, on the phones that block the cross-site refresh cookie
 * outright, how logging in appears to bounce straight back to the login page.
 */
export type RefreshOutcome =
  | { token: string; sessionEnded: false }
  /** The server looked at the cookie and rejected it: revoked, expired, replaced. */
  | { token: null; sessionEnded: true }
  /** No answer, or one that says nothing about whether the session is still good. */
  | { token: null; sessionEnded: false }

/** Only the server actually judging the cookie ends a session. */
const SESSION_ENDING_STATUSES = [401, 403]

let refreshInFlight: Promise<RefreshOutcome> | null = null

const refreshAccessToken = async (): Promise<RefreshOutcome> => {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async (): Promise<RefreshOutcome> => {
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
      return { token: data.token, sessionEnded: false }
    } catch (error) {
      // No `response` at all means the request never completed — DNS, timeout,
      // offline, CORS. A 429 or a 5xx is the server declining to answer the
      // question rather than answering it "no". Neither is grounds for a logout.
      const status = (error as AxiosError).response?.status
      return {
        token: null,
        sessionEnded: status !== undefined && SESSION_ENDING_STATUSES.includes(status),
      }
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
      const outcome = await refreshAccessToken()
      if (outcome.token) {
        original.headers = {
          ...(original.headers ?? {}),
          Authorization: `Bearer ${outcome.token}`,
        }
        return AXIOS_INSTANCE.request(original)
      }
      // Only when the server actually rejected the cookie. A refresh that never
      // got through leaves the session alone: the request below fails, the user
      // sees that one thing failed, and the next refresh succeeds once there is
      // a network again.
      if (outcome.sessionEnded) {
        useAuthStore.getState().logout()
      }
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

/**
 * Every API module calls through here, which makes it the one place that knows
 * a request is outstanding — so the progress indicator is counted here rather
 * than in the interceptors. A 401 that refreshes and replays is one request to
 * the person waiting, even though the interceptors see it twice.
 *
 * `finally` rather than a success path: a counter that only decrements on 200
 * sticks above zero the first time the network drops.
 */
export const httpClient = async <T = unknown>(
  config: AxiosRequestConfig,
): Promise<T> => {
  const { start, finish } = useRequestStore.getState()
  start()
  try {
    const response: AxiosResponse<T> = await AXIOS_INSTANCE.request<T>(config)

    return response.data
  } finally {
    finish()
  }
}

export default httpClient

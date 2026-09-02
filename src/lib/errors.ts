/**
 * Turning a failed request into something a person can act on.
 *
 * The API answers failures with `{ error: "..." }`, and those messages are
 * written to be read — "That service is not set up for this client. Agree a rate
 * on the client's services first." But axios puts its own generic string on
 * `err.message`, so any handler reaching for that shows "Request failed with
 * status code 400" and throws the useful sentence away.
 *
 * That extraction was duplicated inline in seventy-nine places, and about a
 * third of them forgot it. Hence one helper.
 */

type MaybeAxiosError = {
  response?: {
    status?: number
    data?: unknown
  }
  message?: string
  code?: string
}

/** What the server said, if it said anything. */
const serverMessage = (err: MaybeAxiosError): string | null => {
  const data = err?.response?.data

  if (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')) {
    // A plain-text body, but not an HTML error page — those are proxy noise.
    return data.trim()
  }

  if (data && typeof data === 'object') {
    const body = data as Record<string, unknown>
    for (const key of ['error', 'message', 'detail']) {
      const value = body[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  return null
}

/**
 * What to say when the server gave no usable body.
 *
 * These are the cases where the status is the whole story — an expired session,
 * a permission refusal, a record someone else deleted. Left to axios they read
 * as "Request failed with status code 403", which tells a warehouse operator
 * nothing about what to do next.
 */
const byStatus = (status?: number): string | null => {
  switch (status) {
    case 400:
      return 'That request was not valid. Please check the details and try again.'
    case 401:
      return 'Your session has expired. Please sign in again.'
    case 403:
      return 'You do not have permission to do that.'
    case 404:
      return 'That record no longer exists. It may have been deleted.'
    case 409:
      return 'That conflicts with something that already exists.'
    case 429:
      return 'Too many attempts. Please wait a moment and try again.'
    case 500:
    case 502:
    case 503:
      return 'The server had a problem with that. Please try again shortly.'
    default:
      return null
  }
}

/** True when the request never reached the server at all. */
const isNetworkFailure = (err: MaybeAxiosError) =>
  !err?.response && (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED')

/**
 * The message to show a user for a failed request.
 *
 * Order matters: the server's own wording is always the most specific thing
 * available, so it wins. `fallback` is what to say when nothing else is known —
 * make it describe the action that failed, not the failure.
 */
export const errorMessage = (err: unknown, fallback = 'Something went wrong.'): string => {
  const candidate = err as MaybeAxiosError

  if (isNetworkFailure(candidate)) {
    return 'Could not reach the server. Check your connection and try again.'
  }

  const fromServer = serverMessage(candidate)
  if (fromServer) return fromServer

  const fromStatus = byStatus(candidate?.response?.status)
  if (fromStatus) return fromStatus

  // Only now consider err.message, and only if it is not axios boilerplate.
  const raw = typeof candidate?.message === 'string' ? candidate.message.trim() : ''
  if (raw && !/^request failed with status code/i.test(raw)) {
    return raw
  }

  return fallback
}

/**
 * Whether a failure means the session is gone.
 *
 * Worth distinguishing: telling someone to check their details when they have
 * actually been signed out sends them round in circles.
 */
export const isAuthFailure = (err: unknown): boolean =>
  (err as MaybeAxiosError)?.response?.status === 401

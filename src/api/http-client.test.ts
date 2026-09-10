/**
 * httpClient feeding the in-flight counter.
 *
 * This is the join that makes the progress bar work at all: the store is
 * correct on its own and the bar renders from the store, but if httpClient
 * never counts, the bar simply never appears. Worth pinning, because nothing
 * about the app looks broken when it silently does nothing.
 *
 * The case that matters most is a failed request. If the decrement lived on the
 * success path, the first refused or dropped call would strand the counter
 * above zero and leave the bar on screen for the rest of the session.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

const { request, post, responseUse } = vi.hoisted(() => ({
  request: vi.fn(),
  // The bare `axios.post` the refresh call uses, deliberately outside the
  // instance so it does not loop back through these interceptors.
  post: vi.fn(),
  // Captured so the rejection handler can be driven directly — it is where the
  // decision to end a session is made, and nothing else reaches it.
  responseUse: vi.fn(),
}))

vi.mock('axios', () => {
  const instance = {
    request,
    defaults: { baseURL: '' },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: responseUse },
    },
  }
  return {
    default: { create: () => instance, post },
    create: () => instance,
  }
})

import { httpClient } from './http-client'
import { useRequestStore } from '@/lib/requests'
import { useAuthStore } from '@/stores/auth'

const count = () => useRequestStore.getState().inFlight

/**
 * The `onRejected` half of the response interceptor.
 *
 * Grabbed here, at module scope, rather than inside a test: the interceptor is
 * registered once when http-client is imported, and the `clearAllMocks` in
 * beforeEach wipes the recorded call it was registered by. The captured
 * function itself survives that.
 */
const onRejected = responseUse.mock.calls[0][1] as (error: unknown) => Promise<unknown>
const rejectionHandler = () => onRejected

/** A 401 on an ordinary call, which is what triggers a refresh. */
const unauthorized = (url = '/api/things') => ({
  response: { status: 401 },
  config: { url, headers: {} },
})

let logout: Mock<() => void>

beforeEach(() => {
  vi.clearAllMocks()
  useRequestStore.setState({ inFlight: 0 })

  // The real logout reaches for AXIOS_INSTANCE.get, which this mock does not
  // have — and the question here is only whether it is called, never what it
  // does.
  logout = vi.fn<() => void>()
  useAuthStore.setState({ logout, token: 'stale-token' })
})

describe('a request in flight', () => {
  it('is counted while it runs and released when it lands', async () => {
    let peak = 0
    request.mockImplementation(async () => {
      peak = count()
      return { data: { ok: true } }
    })

    expect(count()).toBe(0)
    await httpClient({ url: '/api/things' })

    expect(peak).toBe(1)
    expect(count()).toBe(0)
  })

  it('returns the response body, not the axios envelope', async () => {
    request.mockResolvedValue({ data: { id: 'p1' } })
    await expect(httpClient({ url: '/api/things' })).resolves.toEqual({ id: 'p1' })
  })

  it('counts several at once', async () => {
    let peak = 0
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          peak = Math.max(peak, count())
          setTimeout(() => resolve({ data: null }), 5)
        }),
    )

    await Promise.all([
      httpClient({ url: '/a' }),
      httpClient({ url: '/b' }),
      httpClient({ url: '/c' }),
    ])

    expect(peak).toBe(3)
    expect(count()).toBe(0)
  })
})

describe('a request that fails', () => {
  it('still releases the counter', async () => {
    // The whole reason the decrement is in a `finally`.
    request.mockRejectedValue(new Error('Network Error'))

    await expect(httpClient({ url: '/api/things' })).rejects.toThrow('Network Error')
    expect(count()).toBe(0)
  })

  it('does not strand the counter across a run of failures', async () => {
    request.mockRejectedValue(new Error('boom'))

    for (let i = 0; i < 5; i++) {
      await httpClient({ url: '/api/things' }).catch(() => {})
    }

    expect(count()).toBe(0)
  })

  it('rethrows so callers can still show the server message', async () => {
    const failure = Object.assign(new Error('Request failed'), {
      response: { status: 400, data: { error: 'Pick a location.' } },
    })
    request.mockRejectedValue(failure)

    await expect(httpClient({ url: '/x' })).rejects.toMatchObject({
      response: { data: { error: 'Pick a location.' } },
    })
  })
})

/**
 * When a 401 ends the session, and when it does not.
 *
 * The access token is held in memory and lasts minutes, so a 401 in normal use
 * almost always means it expired — the refresh cookie is still good and the
 * request should simply be replayed. The interesting half is what happens when
 * the refresh itself does not come back with a token, because that used to be
 * one branch: every failure returned null and every null signed the user out.
 *
 * On a warehouse floor that is the difference between "that didn't send, try
 * again" and being thrown to the login screen mid-pick because the phone passed
 * a thick wall. On the phones that block the cross-site refresh cookie outright
 * it is what turns a blocked cookie into an instant bounce back to login.
 */
describe('a 401 during normal use', () => {
  it('refreshes and replays the original request', async () => {
    post.mockResolvedValue({ data: { token: 'fresh-token' } })
    request.mockResolvedValue({ data: 'replayed' })

    await rejectionHandler()(unauthorized())

    expect(post).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      }),
    )
    expect(logout).not.toHaveBeenCalled()
  })

  it('signs out when the server rejects the refresh cookie', async () => {
    // The one case that genuinely means the session is over: revoked, expired,
    // or signed out on another device.
    post.mockRejectedValue({ response: { status: 401 } })

    await rejectionHandler()(unauthorized()).catch(() => {})

    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('stays signed in when the refresh never reaches the server', async () => {
    // No `response` at all — offline, DNS, timeout, a tunnel. This says nothing
    // about the session, and signing someone out for it is the bug.
    post.mockRejectedValue(new Error('Network Error'))

    await rejectionHandler()(unauthorized()).catch(() => {})

    expect(post).toHaveBeenCalledTimes(1)
    expect(logout).not.toHaveBeenCalled()
  })

  it('stays signed in when the refresh is rate limited', async () => {
    // 429 is the server declining to answer the question, not answering it
    // "no" — and /auth/refresh shares the credential limiter, so this happens
    // to real users behind a shared mobile IP.
    post.mockRejectedValue({ response: { status: 429 } })

    await rejectionHandler()(unauthorized()).catch(() => {})

    expect(logout).not.toHaveBeenCalled()
  })

  it('stays signed in when the refresh hits a server error', async () => {
    post.mockRejectedValue({ response: { status: 503 } })

    await rejectionHandler()(unauthorized()).catch(() => {})

    expect(logout).not.toHaveBeenCalled()
  })

  it('still hands the original failure back to the caller', async () => {
    // Whatever happens to the session, the request that failed has to keep
    // failing — swallowing it would leave the caller waiting on a promise that
    // never settles.
    post.mockRejectedValue(new Error('Network Error'))
    const original = unauthorized()

    await expect(rejectionHandler()(original)).rejects.toBe(original)
  })

  it('does not try to refresh a failed refresh', async () => {
    // The loop guard. Pinned here because the code around it moved.
    await rejectionHandler()(unauthorized('/api/auth/refresh')).catch(() => {})

    expect(post).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })
})

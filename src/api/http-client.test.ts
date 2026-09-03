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

import { describe, it, expect, vi, beforeEach } from 'vitest'

const request = vi.hoisted(() => vi.fn())

vi.mock('axios', () => {
  const instance = {
    request,
    defaults: { baseURL: '' },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }
  return {
    default: { create: () => instance, post: vi.fn() },
    create: () => instance,
  }
})

import { httpClient } from './http-client'
import { useRequestStore } from '@/lib/requests'

const count = () => useRequestStore.getState().inFlight

beforeEach(() => {
  vi.clearAllMocks()
  useRequestStore.setState({ inFlight: 0 })
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

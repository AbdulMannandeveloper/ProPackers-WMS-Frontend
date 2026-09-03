/**
 * The in-flight counter behind the top progress bar.
 *
 * The failure that matters is a counter that gets stuck above zero: the bar
 * would then sit on screen for the rest of the session. That happens if a
 * request only decrements on success, so the first dropped connection strands
 * it — which is why httpClient decrements in a `finally`.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import { useRequestStore } from './requests'

const count = () => useRequestStore.getState().inFlight
const { getState } = useRequestStore

beforeEach(() => {
  useRequestStore.setState({ inFlight: 0 })
})

describe('counting requests', () => {
  it('starts at rest', () => {
    expect(count()).toBe(0)
  })

  it('rises and falls with one request', () => {
    getState().start()
    expect(count()).toBe(1)
    getState().finish()
    expect(count()).toBe(0)
  })

  it('tracks several at once', () => {
    // A page load fires five in parallel; the bar must stay up for all of them.
    getState().start()
    getState().start()
    getState().start()
    expect(count()).toBe(3)

    getState().finish()
    expect(count()).toBe(2)
    getState().finish()
    getState().finish()
    expect(count()).toBe(0)
  })
})

describe('the counter cannot get stuck', () => {
  it('never goes negative', () => {
    // A response interceptor can fire for a request that was never counted —
    // a retry replayed after a token refresh. Going negative would then
    // swallow the indicator for every later request.
    getState().finish()
    getState().finish()
    expect(count()).toBe(0)

    getState().start()
    expect(count()).toBe(1)
  })

  it('comes back to zero after a mixed run', () => {
    getState().start()
    getState().start()
    getState().finish()
    getState().finish()
    getState().finish() // one extra, as if from a replay
    expect(count()).toBe(0)
  })
})

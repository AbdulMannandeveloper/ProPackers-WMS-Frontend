import { create } from 'zustand'

/**
 * How many requests are in flight right now.
 *
 * Fed from the axios interceptors that already exist in api/http-client.ts, so
 * every call in the app is counted without a single page having to opt in —
 * including the ones no button triggered, like a token refresh or a background
 * reload.
 *
 * The only thing that really matters here is that `finish` runs on failure as
 * well as success. A counter that only decrements on 200 gets stuck above zero
 * the first time the network drops and leaves a progress bar on screen forever.
 */

type RequestState = {
  inFlight: number
  start: () => void
  finish: () => void
}

export const useRequestStore = create<RequestState>((set) => ({
  inFlight: 0,
  start: () => set((s) => ({ inFlight: s.inFlight + 1 })),
  // Clamped at zero: a response interceptor can fire for a request that was
  // never counted (a retry replayed after a refresh), and a negative count
  // would then swallow the indicator for every later request.
  finish: () => set((s) => ({ inFlight: Math.max(0, s.inFlight - 1) })),
}))

/** True while anything is loading. */
export const useIsLoading = () => useRequestStore((s) => s.inFlight > 0)

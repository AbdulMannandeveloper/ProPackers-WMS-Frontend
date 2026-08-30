/**
 * Shared setup for the component suite.
 *
 * The suite used to run with environment: 'node', which meant the only testable
 * things were pure functions — three modules out of a seventeen-page app. jsdom
 * gives us the pages themselves.
 *
 * What jsdom does NOT give us, and must not be faked into a false pass:
 * a real camera, a real clipboard, real cookie handling behind nginx, or TLS.
 * Those live in docs/QA-CHECKLIST.md and are done by hand.
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// jsdom implements neither, and Tailwind's responsive components call both.
// Without these, any page using a media query throws on render.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// Not implemented in jsdom; Radix and several dialogs call it.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Covers the pure parts of the scanner only — camera streams and decode loops
// are not meaningfully unit-testable, and are verified by hand in a browser.
// A full frontend harness (jsdom, testing-library) is Phase 8.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

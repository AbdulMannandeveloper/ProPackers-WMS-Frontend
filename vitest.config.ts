import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

/**
 * Two kinds of test live here.
 *
 * `.test.ts`  — pure logic: scanner maths, the courier registry, clipboard
 *               tiers. These were the whole suite until Phase 8.
 * `.test.tsx` — components and pages, rendered in jsdom with testing-library.
 *
 * Both run in jsdom. The pure tests do not need a DOM, but splitting the
 * environment by file pattern buys nothing and makes the config a puzzle.
 *
 * Deliberately out of scope here: the camera, the real clipboard, cookies behind
 * nginx, and TLS. jsdom cannot exercise any of them honestly, so they are in
 * docs/QA-CHECKLIST.md instead of being mocked into a green tick.
 *
 * jsdom is pinned to v26 deliberately. v27 pulls in @asamuzakjp/css-color,
 * whose CJS build require()s an ESM dependency; that is only legal from Node
 * 22.12, and this project runs 22.11, so v27 fails to collect a single test.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The page tests render large screens into jsdom and drive them through
    // userEvent, which is slow under load. The inventory page is the worst of
    // them: 11s on its own, 22s when the whole suite is competing for the
    // machine — so it failed at 20s while passing in isolation, which is the
    // least useful kind of red.
    //
    // Raised rather than chased, because the alternative is a suite that is
    // green or red depending on what else the laptop is doing.
    testTimeout: 30_000,
  },
})

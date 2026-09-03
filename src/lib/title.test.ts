/**
 * What the browser tab says.
 *
 * Every route declared a `title` from the start and nothing read them, so every
 * tab in the app said "Vite + React + TS". The rule the user asked for is that a
 * landing page names the business and everywhere else names the page, because
 * that is what tells two open tabs apart.
 */

import { describe, it, expect } from 'vitest'

import { resolveTitle, isHomePath, BRAND } from './title'

describe('landing pages show the brand alone', () => {
  it('does so for each audience', () => {
    // One per role: staff land on /app, clients on /client, visitors on /.
    expect(resolveTitle('Dashboard', '/app')).toBe(BRAND)
    expect(resolveTitle('Overview', '/client')).toBe(BRAND)
    expect(resolveTitle('Home', '/')).toBe(BRAND)
  })

  it('is not fooled by a trailing slash', () => {
    // Which spelling you get depends on how the user arrived.
    expect(resolveTitle('Dashboard', '/app/')).toBe(BRAND)
    expect(resolveTitle('Overview', '/client/')).toBe(BRAND)
  })

  it('drops the route title rather than appending it', () => {
    // The declared title is "Dashboard"; showing it would defeat the point.
    expect(resolveTitle('Dashboard', '/app')).not.toMatch(/dashboard/i)
  })
})

describe('every other page names itself first', () => {
  it('puts the page before the brand', () => {
    // Page first so it survives a narrow tab, which is the whole reason for
    // the ordering.
    expect(resolveTitle('Inventory', '/app/inventory')).toBe(`Inventory · ${BRAND}`)
    expect(resolveTitle('FBA Shipments', '/app/fba')).toBe(`FBA Shipments · ${BRAND}`)
  })

  it('covers the client portal and the auth pages too', () => {
    expect(resolveTitle('Billing & Invoices', '/client/billing')).toBe(
      `Billing & Invoices · ${BRAND}`,
    )
    expect(resolveTitle('Login', '/auth/login')).toBe(`Login · ${BRAND}`)
  })

  it('does not treat a path merely starting with /app as a landing page', () => {
    // "/app/users" begins with "/app"; a prefix check would wrongly bare it.
    expect(resolveTitle('Users', '/app/users')).toBe(`Users · ${BRAND}`)
    expect(isHomePath('/app/users')).toBe(false)
  })
})

describe('routes with nothing declared', () => {
  it('falls back to the brand rather than showing a stray separator', () => {
    expect(resolveTitle(undefined, '/app/somewhere')).toBe(BRAND)
    expect(resolveTitle('', '/app/somewhere')).toBe(BRAND)
    expect(resolveTitle('   ', '/app/somewhere')).toBe(BRAND)
  })

  it('never returns an empty string or the word undefined', () => {
    for (const [title, path] of [
      [undefined, '/'],
      ['', '/app/x'],
      ['Users', '/app/users'],
    ] as const) {
      const out = resolveTitle(title, path)
      expect(out.length).toBeGreaterThan(0)
      expect(out).not.toMatch(/undefined/)
    }
  })
})

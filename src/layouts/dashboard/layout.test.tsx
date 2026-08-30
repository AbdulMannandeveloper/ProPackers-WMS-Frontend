/**
 * What each role sees in the sidebar.
 *
 * The filter used to test only `adminOnly`, so every non-admin item fell
 * through to `return true` — and a client, who shares this layout with staff,
 * saw Dashboard, Attendance, Inventory, Shipments and Payroll. Those are all
 * staff routes that redirect on click, so nothing leaked, but a paying customer
 * was looking at our payroll menu and had no link to their own portal.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import DashboardLayout from './layout'
import { useAuthStore } from '@/stores/auth'

const asRole = (role: 'admin' | 'employee' | 'client') => {
  useAuthStore.setState({
    role,
    token: 'test-token',
    authReady: true,
    displayName: 'Test User',
    userId: 'user-1',
  } as never)
}

const renderNav = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <DashboardLayout>
        <div>content</div>
      </DashboardLayout>
    </MemoryRouter>
  )

/** Sidebar link labels, which is what the filter actually decides. */
const linkNames = () =>
  screen.getAllByRole('link').map((a) => a.textContent?.trim() ?? '')

/**
 * Where the sidebar links actually point.
 *
 * Asserted for the client instead of the labels: a client now has their own
 * "My Inventory", so matching the word "inventory" no longer distinguishes
 * their page from the staff one. The destination does.
 */
const linkHrefs = () =>
  screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '')

beforeEach(() => {
  useAuthStore.setState({ role: null, token: null } as never)
})

describe('a client', () => {
  beforeEach(() => asRole('client'))

  it('sees their own portal sections', () => {
    renderNav()
    const hrefs = linkHrefs()

    expect(hrefs).toContain('/client')
    expect(hrefs).toContain('/client/billing')
    expect(hrefs).toContain('/client/inventory')
  })

  it('can reach every section from the sidebar', () => {
    // The portal briefly had a second column of links inside the page while the
    // real sidebar held one item.
    renderNav()
    expect(linkHrefs()).toHaveLength(5)
  })

  it('is shown nothing outside the portal', () => {
    // The original bug was a client seeing the whole staff sidebar. Asserted on
    // destinations rather than labels, because a client's own "My Inventory"
    // and the staff Inventory page share a word but not an address.
    renderNav()

    for (const href of linkHrefs()) {
      expect(href.startsWith('/client')).toBe(true)
    }
  })

  it('is shown no /app route at all', () => {
    renderNav()
    expect(linkHrefs().some((h) => h.startsWith('/app'))).toBe(false)
  })

  it('is not shown admin areas either', () => {
    renderNav()
    const nav = linkNames().join(' | ')

    expect(nav).not.toMatch(/users/i)
    expect(nav).not.toMatch(/expenses/i)
    expect(nav).not.toMatch(/profit/i)
  })
})

describe('which section is marked current', () => {
  beforeEach(() => asRole('client'))

  it('marks Overview on the portal root', () => {
    renderNav('/client')
    const current = screen.getAllByRole('link').filter(
      (a) => a.getAttribute('aria-current') === 'page'
    )
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('href')).toBe('/client')
  });

  it('does not leave Overview lit on a sub-page', () => {
    // '/client' is a prefix of every section beneath it, so a startsWith match
    // marks Overview current everywhere — two links claiming to be the page.
    renderNav('/client/billing')
    const current = screen.getAllByRole('link').filter(
      (a) => a.getAttribute('aria-current') === 'page'
    )

    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('href')).toBe('/client/billing')
  })
})

describe('an employee', () => {
  beforeEach(() => asRole('employee'))

  it('sees the warehouse areas they work in', () => {
    renderNav()
    const nav = linkNames().join(' | ')

    expect(nav).toMatch(/inventory/i)
    expect(nav).toMatch(/shipments/i)
    // Staff manage the layout of the building they work in.
    expect(nav).toMatch(/warehouse locations/i)
  })

  it('is not shown the admin-only areas', () => {
    renderNav()
    const nav = linkNames().join(' | ')

    expect(nav).not.toMatch(/users/i)
    expect(nav).not.toMatch(/clients/i)
    expect(nav).not.toMatch(/invoices/i)
    expect(nav).not.toMatch(/expenses/i)
    expect(nav).not.toMatch(/profit/i)
  })
})

describe('an admin', () => {
  beforeEach(() => asRole('admin'))

  it('sees everything', () => {
    renderNav()
    const nav = linkNames().join(' | ')

    expect(nav).toMatch(/users/i)
    expect(nav).toMatch(/invoices/i)
    expect(nav).toMatch(/profit/i)
    expect(nav).toMatch(/shipments/i)
  })
})

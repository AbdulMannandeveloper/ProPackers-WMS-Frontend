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
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

import DashboardLayout from './layout'
import { useAuthStore } from '@/stores/auth'
import { clientRoutes } from '@/routes/client'

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

  it('can reach every portal route from the sidebar', () => {
    // Derived from the route table rather than a hardcoded count, so adding a
    // section without a link fails here instead of shipping unreachable. The
    // portal briefly had a second column of links inside the page while the real
    // sidebar held one item, and a bare number would not have caught that.
    const expected = clientRoutes.routes.map((r) =>
      r.path === '/' ? '/client' : `/client${r.path}`
    )
    renderNav()

    for (const href of expected) {
      expect(linkHrefs()).toContain(href)
    }
    expect(linkHrefs()).toHaveLength(expected.length)
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

describe('navigation on a phone', () => {
  // The sidebar is `hidden md:flex`, so below that breakpoint this drawer is the
  // only way to move around the app at all. There was previously nothing: a
  // phone user could reach whichever page they landed on and go nowhere else.
  beforeEach(() => asRole('employee'))

  it('offers a way to open the navigation', () => {
    renderNav()
    expect(screen.getByRole('button', { name: /open navigation/i })).toBeInTheDocument()
  })

  it('starts closed', () => {
    renderNav()
    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument()
  })

  it('opens on tapping the button', async () => {
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }))

    expect(screen.getByRole('dialog', { name: /navigation/i })).toBeInTheDocument()
  })

  it('carries the same role-filtered links as the sidebar', async () => {
    // Not a second list to keep in step: it renders visibleNavItems, so the
    // role filtering built earlier applies to both.
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }))

    const drawer = screen.getByRole('dialog', { name: /navigation/i })
    const hrefs = [...drawer.querySelectorAll('a')].map((a) => a.getAttribute('href'))

    expect(hrefs).toContain('/app/shipments')
    expect(hrefs).toContain('/app/inventory')
    // An employee still may not see the admin areas.
    expect(hrefs).not.toContain('/app/users')
    expect(hrefs).not.toContain('/app/invoices')
  })

  it('shows a client only their own portal', async () => {
    asRole('client')
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }))

    const drawer = screen.getByRole('dialog', { name: /navigation/i })
    for (const a of drawer.querySelectorAll('a')) {
      expect(a.getAttribute('href')?.startsWith('/client')).toBe(true)
    }
  })

  it('can be closed again', async () => {
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }))
    await userEvent.click(screen.getAllByRole('button', { name: /close navigation/i })[0])

    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument()
  })

  it('marks the current page inside the drawer too', async () => {
    renderNav('/app/shipments')
    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }))

    const drawer = screen.getByRole('dialog', { name: /navigation/i })
    const current = [...drawer.querySelectorAll('[aria-current="page"]')]
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('href')).toBe('/app/shipments')
  })
})

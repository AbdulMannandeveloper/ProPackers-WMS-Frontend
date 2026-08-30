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

const renderNav = () =>
  render(
    <MemoryRouter>
      <DashboardLayout>
        <div>content</div>
      </DashboardLayout>
    </MemoryRouter>
  )

/** Sidebar link labels, which is what the filter actually decides. */
const linkNames = () =>
  screen.getAllByRole('link').map((a) => a.textContent?.trim() ?? '')

beforeEach(() => {
  useAuthStore.setState({ role: null, token: null } as never)
})

describe('a client', () => {
  beforeEach(() => asRole('client'))

  it('sees a link to their own portal', () => {
    renderNav()
    expect(linkNames().join(' | ')).toMatch(/portal/i)
  })

  it('is not shown staff areas', () => {
    // The bug, stated as five assertions.
    renderNav()
    const nav = linkNames().join(' | ')

    expect(nav).not.toMatch(/payroll/i)
    expect(nav).not.toMatch(/inventory/i)
    expect(nav).not.toMatch(/shipments/i)
    expect(nav).not.toMatch(/attendance/i)
    expect(nav).not.toMatch(/dashboard/i)
  })

  it('is not shown admin areas either', () => {
    renderNav()
    const nav = linkNames().join(' | ')

    expect(nav).not.toMatch(/users/i)
    expect(nav).not.toMatch(/expenses/i)
    expect(nav).not.toMatch(/profit/i)
  })
})

describe('an employee', () => {
  beforeEach(() => asRole('employee'))

  it('sees the warehouse areas they work in', () => {
    renderNav()
    const nav = linkNames().join(' | ')

    expect(nav).toMatch(/inventory/i)
    expect(nav).toMatch(/shipments/i)
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

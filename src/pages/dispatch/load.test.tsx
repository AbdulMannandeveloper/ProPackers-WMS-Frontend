/**
 * Which endpoint the dispatch page asks for the client list.
 *
 * This bug shipped twice on the old shipments page. The employee and client
 * lists were fetched with admin-only endpoints — getAllEmployees and
 * getAllClients — each wrapped in `.catch(() => [])`. Signed in as an employee,
 * both 403s were swallowed, both dropdowns came back empty, and pressing
 * Register Outbound Order refused with "Need registered clients and employees
 * to configure outbounds" while both plainly existed in the database.
 *
 * That form is gone. The risk moved here: dispatch still needs client names, to
 * say whose goods the scan settled on. Failing silently would leave the header
 * reading "set by the first item" forever and looking broken.
 *
 * Carried over from src/pages/shipments/load.test.tsx, which was deleted with
 * the form it described.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getClientLookup, getAllClients } = vi.hoisted(() => ({
  getClientLookup: vi.fn(),
  getAllClients: vi.fn(),
}))

vi.mock('@/api', () => ({
  clients: { getClientLookup, getAllClients },
  products: { lookupByCode: vi.fn() },
  shipments: { findByReference: vi.fn(), createShipment: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  getClientLookup.mockResolvedValue([{ id: 'c1', companyName: 'Acme Ltd' }])
  getAllClients.mockResolvedValue([{ id: 'c1', companyName: 'Acme Ltd' }])
})

const renderAs = async (role: 'admin' | 'employee') => {
  const { render, waitFor } = await import('@testing-library/react')
  const { MemoryRouter } = await import('react-router')
  const { default: DispatchPage } = await import('./index')
  const { useAuthStore } = await import('@/stores/auth')

  useAuthStore.setState({
    role,
    token: 'test-token',
    authReady: true,
    userId: 'u1',
  } as never)

  render(
    <MemoryRouter>
      <DispatchPage />
    </MemoryRouter>,
  )

  await waitFor(() =>
    expect(getClientLookup.mock.calls.length + getAllClients.mock.calls.length).toBeGreaterThan(0),
  )
}

describe('loading the client list', () => {
  it('uses the staff-accessible lookup for an employee', async () => {
    // getAllClients is admin-only. Asking for it as an employee is a 403 that
    // this page would swallow.
    await renderAs('employee')

    expect(getClientLookup).toHaveBeenCalled()
    expect(getAllClients).not.toHaveBeenCalled()
  })

  it('uses the full list for an admin, who is allowed it', async () => {
    await renderAs('admin')

    expect(getAllClients).toHaveBeenCalled()
    expect(getClientLookup).not.toHaveBeenCalled()
  })
})

describe('when the client list cannot be loaded', () => {
  it('says so instead of leaving the header blank forever', async () => {
    // The habit this replaces was `.catch(() => [])`, which turned one 403 into
    // two separate bug reports because nothing on screen said anything failed.
    const { screen, waitFor } = await import('@testing-library/react')
    getClientLookup.mockRejectedValue({
      response: { status: 403, data: { error: 'Forbidden' } },
    })

    const { render } = await import('@testing-library/react')
    const { MemoryRouter } = await import('react-router')
    const { default: DispatchPage } = await import('./index')
    const { useAuthStore } = await import('@/stores/auth')

    useAuthStore.setState({
      role: 'employee',
      token: 't',
      authReady: true,
      userId: 'u1',
    } as never)

    render(
      <MemoryRouter>
        <DispatchPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText(/not available/i)).toBeTruthy()
  })
})

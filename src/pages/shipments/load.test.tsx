/**
 * What the shipments page asks the API for when it loads.
 *
 * This bug shipped twice. Both the employee list and the client list were being
 * fetched with admin-only endpoints — getAllEmployees and getAllClients —
 * each wrapped in `.catch(() => [])`. Logged in as an employee, both 403s were
 * swallowed, both dropdowns came back empty, and pressing Register Outbound
 * Order refused with "Need registered clients and employees to configure
 * outbounds" while both plainly existed in the database.
 *
 * The lookups are the staff-accessible endpoints, and they return only what the
 * dropdowns render. These tests pin the choice of endpoint, because the failure
 * mode is silent: nothing throws, the page just quietly cannot be used.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const getEmployeeLookup = vi.fn()
const getAllEmployees = vi.fn()
const getClientLookup = vi.fn()
const getAllClients = vi.fn()

vi.mock('@/api', () => ({
  shipments: { getAllShipments: vi.fn().mockResolvedValue([]) },
  products: { getAllProducts: vi.fn().mockResolvedValue([]) },
  stock: { getAllStockLevels: vi.fn().mockResolvedValue([]) },
  employees: { getEmployeeLookup, getAllEmployees },
  clients: { getClientLookup, getAllClients },
  clientServices: { getClientServicesByClientId: vi.fn().mockResolvedValue([]) },
}))

beforeEach(() => {
  vi.clearAllMocks()
  getEmployeeLookup.mockResolvedValue([
    { id: 'e1', firstName: 'Ella', lastName: 'Operator' },
  ])
  getClientLookup.mockResolvedValue([{ id: 'c1', companyName: 'Acme Ltd' }])
  getAllEmployees.mockRejectedValue(new Error('403'))
  getAllClients.mockRejectedValue(new Error('403'))
})

/** Renders the page and lets its initial load settle. */
const renderPage = async () => {
  const { render } = await import('@testing-library/react')
  const { MemoryRouter } = await import('react-router')
  const { default: ShipmentsPage } = await import('./index')
  const { useAuthStore } = await import('@/stores/auth')

  useAuthStore.setState({
    role: 'employee',
    token: 'test-token',
    authReady: true,
    userId: 'u1',
  } as never)

  const result = render(
    <MemoryRouter>
      <ShipmentsPage />
    </MemoryRouter>
  )
  // Let the Promise.all in loadData resolve.
  await new Promise((r) => setTimeout(r, 0))
  return result
}

describe('loading the operator and client lists', () => {
  it('uses the staff-accessible employee lookup', async () => {
    await renderPage()
    expect(getEmployeeLookup).toHaveBeenCalled()
  })

  it('uses the staff-accessible client lookup', async () => {
    // The blocker: this was getAllClients, which an employee may not call.
    await renderPage()
    expect(getClientLookup).toHaveBeenCalled()
  })

  it('does not call the admin-only endpoints', async () => {
    // Stated as its own assertion because calling them "just in case" is how
    // the 403 came back the second time.
    await renderPage()
    expect(getAllEmployees).not.toHaveBeenCalled()
    expect(getAllClients).not.toHaveBeenCalled()
  })

  it('still renders when a lookup fails, rather than throwing', async () => {
    getClientLookup.mockRejectedValue(new Error('network'))
    const { container } = await renderPage()
    expect(container).toBeTruthy()
  })
})

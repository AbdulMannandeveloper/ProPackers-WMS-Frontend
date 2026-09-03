/**
 * Registering a product with its opening stock in one go.
 *
 * Reported as "if I create a new product and try to add the quantity at that
 * time, it doesn't get added". The path is: Add product → tick "Add opening
 * stock now" → type a quantity → Save, which should reach the API as a
 * createProduct carrying an `initialStock` block. The backend has handled that
 * block correctly all along (logic/product.logic.js), so anything lost here is
 * lost on the way out.
 *
 * The interesting case is the operator who never touches the location dropdown,
 * because a dropdown showing a location already looks chosen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const getAllProducts = vi.fn()
const createProduct = vi.fn()
const getAllWarehouseLocations = vi.fn()
const getClientLookup = vi.fn()
const getAllClients = vi.fn()

vi.mock('@/api', () => ({
  products: {
    getAllProducts,
    createProduct,
    updateProduct: vi.fn(),
    getProductAndStockLevelById: vi.fn().mockResolvedValue({}),
    lookupByCode: vi.fn(),
    attachBarcode: vi.fn(),
  },
  stock: { getAllStockLevels: vi.fn().mockResolvedValue([]) },
  inventory: {
    getAllInventoryLedgers: vi.fn().mockResolvedValue([]),
    createInventoryLedgerEntry: vi.fn().mockResolvedValue({}),
  },
  clients: { getClientLookup, getAllClients },
  warehouseLocations: { getAllWarehouseLocations },
  auditLogs: { getAllAuditLogs: vi.fn().mockResolvedValue([]) },
}))

const LOCATIONS = [
  { id: 'loc-1', locationName: 'A-01-01', zone: 'A' },
  { id: 'loc-2', locationName: 'B-02-04', zone: 'B' },
]

beforeEach(() => {
  vi.clearAllMocks()
  getAllProducts.mockResolvedValue([])
  getAllClients.mockResolvedValue([{ id: 'c1', companyName: 'Acme Ltd' }])
  getClientLookup.mockResolvedValue([{ id: 'c1', companyName: 'Acme Ltd' }])
  getAllWarehouseLocations.mockResolvedValue(LOCATIONS)
  createProduct.mockResolvedValue({ id: 'p-new' })
})

const renderPage = async () => {
  const { render } = await import('@testing-library/react')
  const { MemoryRouter } = await import('react-router')
  const { default: InventoryPage } = await import('./index')
  const { useAuthStore } = await import('@/stores/auth')

  useAuthStore.setState({
    role: 'admin',
    token: 'test-token',
    authReady: true,
    userId: 'u1',
  } as never)

  const utils = render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  )

  const { waitFor } = await import('@testing-library/react')
  await waitFor(() => expect(getAllWarehouseLocations).toHaveBeenCalled())
  return utils
}

/** Opens the modal, ticks opening stock and sets a quantity. */
const fillOpeningStock = async (quantity: string) => {
  const { screen, fireEvent, waitFor } = await import('@testing-library/react')
  const userEventMod = await import('@testing-library/user-event')
  const user = userEventMod.default.setup()

  await user.click(screen.getByRole('button', { name: /add product/i }))

  await waitFor(() => expect(screen.getByLabelText('SKU Code *')).toBeTruthy())

  await user.type(screen.getByLabelText('SKU Code *'), 'SKU-001')
  await user.type(screen.getByLabelText('Product Name *'), 'Blue Widget')

  await user.click(screen.getByLabelText(/add opening stock now/i))

  // Exact text: the Adjust Stock modal renders its own "Quantity" label.
  const qty = screen.getByLabelText('Quantity *') as HTMLInputElement
  fireEvent.change(qty, { target: { value: quantity } })
}

describe('registering a product with opening stock', () => {
  it('sends the quantity when the operator never touches the location dropdown', async () => {
    // The dropdown shows a location the moment it is revealed, so there is
    // nothing on screen telling the operator to pick one. If the value behind it
    // is empty, the save is refused and no product is created at all — which is
    // exactly what "the quantity doesn't get added" looks like from the outside.
    const { screen } = await import('@testing-library/react')
    const userEventMod = await import('@testing-library/user-event')
    const user = userEventMod.default.setup()
    const { waitFor } = await import('@testing-library/react')

    await renderPage()
    await fillOpeningStock('40')

    await user.click(screen.getByRole('button', { name: /^save|register|create/i }))

    await waitFor(() => expect(createProduct).toHaveBeenCalled())

    const payload = createProduct.mock.calls[0][0]
    expect(payload.initialStock).toBeTruthy()
    expect(payload.initialStock.quantity).toBe(40)
    expect(payload.initialStock.locationId).toBe('loc-1')
  })

  it('sends the location the operator did choose', async () => {
    const { screen } = await import('@testing-library/react')
    const userEventMod = await import('@testing-library/user-event')
    const user = userEventMod.default.setup()
    const { waitFor } = await import('@testing-library/react')

    await renderPage()
    await fillOpeningStock('7')

    await user.selectOptions(screen.getByLabelText('Location *'), 'loc-2')
    await user.click(screen.getByRole('button', { name: /^save|register|create/i }))

    await waitFor(() => expect(createProduct).toHaveBeenCalled())
    expect(createProduct.mock.calls[0][0].initialStock.locationId).toBe('loc-2')
  })

  it('leaves initialStock off entirely when the box is not ticked', async () => {
    // A catalogue-only SKU must not silently arrive on a shelf.
    const { screen } = await import('@testing-library/react')
    const userEventMod = await import('@testing-library/user-event')
    const user = userEventMod.default.setup()
    const { waitFor } = await import('@testing-library/react')

    await renderPage()

    await user.click(screen.getByRole('button', { name: /add product/i }))
    await waitFor(() => expect(screen.getByLabelText('SKU Code *')).toBeTruthy())
    await user.type(screen.getByLabelText('SKU Code *'), 'SKU-002')
    await user.type(screen.getByLabelText('Product Name *'), 'Catalogue Only')
    await user.click(screen.getByRole('button', { name: /^save|register|create/i }))

    await waitFor(() => expect(createProduct).toHaveBeenCalled())
    expect(createProduct.mock.calls[0][0].initialStock).toBeUndefined()
  })
})

describe('when the operator is quicker than the page', () => {
  it('still books the stock if the modal opened before locations arrived', async () => {
    // The page fires five fetches in parallel and the modal is one click away.
    // handleOpenAddProduct seeds the location from locations[0] *at open time*,
    // so opening it a moment early leaves that state empty — and then the
    // dropdown fills in behind it, showing a location that was never chosen.
    // Save is refused and no product is created: "the quantity doesn't get added".
    const { screen, waitFor, fireEvent } = await import('@testing-library/react')
    const userEventMod = await import('@testing-library/user-event')
    const user = userEventMod.default.setup()

    let releaseLocations: (v: unknown) => void = () => {}
    getAllWarehouseLocations.mockReturnValue(
      new Promise((resolve) => {
        releaseLocations = resolve
      }),
    )

    await renderPage()

    // Operator opens the form while locations are still in flight.
    await user.click(screen.getByRole('button', { name: /add product/i }))
    await waitFor(() => expect(screen.getByLabelText('SKU Code *')).toBeTruthy())

    releaseLocations(LOCATIONS)
    await waitFor(() =>
      expect((screen.getByLabelText('SKU Code *') as HTMLElement).isConnected).toBe(true),
    )

    await user.type(screen.getByLabelText('SKU Code *'), 'SKU-003')
    await user.type(screen.getByLabelText('Product Name *'), 'Raced The Page')
    await user.click(screen.getByLabelText(/add opening stock now/i))

    fireEvent.change(screen.getByLabelText('Quantity *'), { target: { value: '12' } })
    await user.click(screen.getByRole('button', { name: /^save|register|create/i }))

    await waitFor(() => expect(createProduct).toHaveBeenCalled())
    const payload = createProduct.mock.calls[0][0]
    expect(payload.initialStock).toBeTruthy()
    expect(payload.initialStock.quantity).toBe(12)
    expect(payload.initialStock.locationId).toBe('loc-1')
  })
})

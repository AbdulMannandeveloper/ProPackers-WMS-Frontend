/**
 * One scan, one item.
 *
 * A product held in a single bin used to arrive as quantity 2. The single-bin
 * shortcut was an effect inside the split dialog, and StrictMode runs effects
 * twice in development precisely to surface side effects that are not
 * idempotent — mergeLines then added the two calls together.
 *
 * So these render inside StrictMode deliberately. Without it the double
 * invocation never happens and the test passes while the app is broken, which
 * is how the bug reached the bench in the first place.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const { lookupByCode, findByReference, createShipment } = vi.hoisted(() => ({
  lookupByCode: vi.fn(),
  findByReference: vi.fn(),
  createShipment: vi.fn(),
}))

vi.mock('@/api', () => ({
  products: { lookupByCode },
  shipments: { findByReference, createShipment },
}))

// The camera is not the subject here and jsdom has no getUserMedia.
vi.mock('@/components/scanner', () => ({
  BarcodeScanner: () => null,
  createWedgeListener: () => () => {},
}))

import { DispatchSession } from './DispatchSession'

/** A product sitting in `binCount` bins, each holding plenty. */
const match = (binCount: number, overrides = {}) => ({
  id: 'p1',
  clientId: 'c1',
  skuCode: 'SKU-100',
  productName: 'Blue Tape',
  client: { id: 'c1', companyName: 'Acme Ltd' },
  stockLevels: Array.from({ length: binCount }, (_, i) => ({
    id: `s${i}`,
    locationId: `loc${i}`,
    currentQuantity: 50,
    reservedQuantity: 0,
    location: { id: `loc${i}`, locationName: `Bin ${i}` },
  })),
  ...overrides,
})

const renderSession = () =>
  render(
    <StrictMode>
      <DispatchSession
        clients={[{ id: 'c1', companyName: 'Acme Ltd' }]}
        onDone={vi.fn()}
        onDispatched={vi.fn()}
      />
    </StrictMode>,
  )

const typeInto = (label: string | RegExp, value: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement
  fireEvent.change(input, { target: { value } })
  fireEvent.submit(input.closest('form')!)
}

beforeEach(() => {
  vi.clearAllMocks()
  findByReference.mockResolvedValue(null)
})

/** Gets past the label step, which gates everything else. */
const startSession = async () => {
  renderSession()
  typeInto('Shipment label', 'SHP-0001')
  await waitFor(() => expect(screen.getByLabelText('Barcode or SKU')).toBeTruthy())
}

describe('adding a product held in one bin', () => {
  it('adds exactly one, not two', async () => {
    // The regression. StrictMode double-invokes effects; the shortcut must not
    // be one.
    lookupByCode.mockResolvedValue({ matches: [match(1)] })

    await startSession()
    typeInto('Barcode or SKU', 'SKU-100')

    await waitFor(() => expect(screen.getByLabelText(/Quantity of Blue Tape/)).toBeTruthy())
    expect((screen.getByLabelText(/Quantity of Blue Tape/) as HTMLInputElement).value).toBe('1')
  })

  it('adds one line, not two', async () => {
    lookupByCode.mockResolvedValue({ matches: [match(1)] })

    await startSession()
    typeInto('Barcode or SKU', 'SKU-100')

    await waitFor(() => expect(screen.getAllByLabelText(/Quantity of/)).toHaveLength(1))
  })

  it('never opens the split dialog for a single bin', async () => {
    // A question with one answer is not a decision.
    lookupByCode.mockResolvedValue({ matches: [match(1)] })

    await startSession()
    typeInto('Barcode or SKU', 'SKU-100')

    await waitFor(() => expect(screen.getByLabelText(/Quantity of Blue Tape/)).toBeTruthy())
    expect(screen.queryByLabelText(/^Take from/)).toBeNull()
  })

  it('counts up on a second scan of the same product', async () => {
    lookupByCode.mockResolvedValue({ matches: [match(1)] })

    await startSession()
    typeInto('Barcode or SKU', 'SKU-100')
    await waitFor(() => expect(screen.getByLabelText(/Quantity of Blue Tape/)).toBeTruthy())

    typeInto('Barcode or SKU', 'SKU-100')

    await waitFor(() =>
      expect((screen.getByLabelText(/Quantity of Blue Tape/) as HTMLInputElement).value).toBe('2'),
    )
    expect(screen.getAllByLabelText(/Quantity of/)).toHaveLength(1)
  })
})

describe('a product spread across several bins', () => {
  it('asks which bins to draw from', async () => {
    lookupByCode.mockResolvedValue({ matches: [match(2)] })

    await startSession()
    typeInto('Barcode or SKU', 'SKU-100')

    await waitFor(() => expect(screen.getAllByLabelText(/^Take from/)).toHaveLength(2))
    // Nothing is added until the split is confirmed.
    expect(screen.queryByLabelText(/Quantity of/)).toBeNull()
  })
})

describe('a product with nothing on the shelf', () => {
  it('says so rather than opening an empty dialog', async () => {
    lookupByCode.mockResolvedValue({ matches: [match(0)] })

    await startSession()
    typeInto('Barcode or SKU', 'SKU-100')

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toMatch(/no stock available/i)
  })
})

describe('the label gates the goods', () => {
  it('offers no product input until a label is scanned', () => {
    renderSession()

    expect(screen.getByLabelText('Shipment label')).toBeTruthy()
    expect(screen.queryByLabelText('Barcode or SKU')).toBeNull()
  })

  it('refuses a label already used, naming the earlier shipment', async () => {
    findByReference.mockResolvedValue({
      createdAt: '2026-09-04T10:00:00.000Z',
      client: { companyName: 'Nestle' },
    })

    renderSession()
    typeInto('Shipment label', 'SHP-USED')

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toMatch(/already used/i)
    expect(screen.getByRole('alert').textContent).toMatch(/Nestle/)
    expect(screen.queryByLabelText('Barcode or SKU')).toBeNull()
  })
})

describe('the tracking step', () => {
  /** Label, one product, then out of picking. */
  const reachTracking = async () => {
    lookupByCode.mockResolvedValue({ matches: [match(1)] })
    await startSession()
    typeInto('Barcode or SKU', 'SKU-100')
    await waitFor(() => expect(screen.getByLabelText(/Quantity of Blue Tape/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByLabelText('Tracking number')).toBeTruthy())
  }

  it('cannot be reached with nothing picked', async () => {
    // Continue is the only way out of picking, and an empty shipment is not one.
    await startSession()

    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('takes the screen once the goods are picked', async () => {
    // The point of the change: it is a step, not a field beside the button that
    // sends the shipment.
    await reachTracking()

    expect(screen.getByText(/Step 3 of 4/)).toBeTruthy()
    expect(screen.queryByLabelText('Barcode or SKU')).toBeNull()
  })

  it('can be skipped, and dispatch is still reachable', async () => {
    await reachTracking()

    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dispatch shipment' })).toBeTruthy(),
    )
    expect(screen.getByText(/no tracking number/)).toBeTruthy()
  })

  it('keeps what was typed when you go back to it', async () => {
    // Skipping must not be a one-way door: the courier's number often turns up
    // a minute later.
    await reachTracking()

    fireEvent.change(screen.getByLabelText('Tracking number'), {
      target: { value: 'H01AA9988776655' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dispatch shipment' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => expect(screen.getByLabelText('Tracking number')).toBeTruthy())
    expect((screen.getByLabelText('Tracking number') as HTMLInputElement).value).toBe(
      'H01AA9988776655',
    )
  })

  it('sends the number it was given', async () => {
    await reachTracking()

    fireEvent.change(screen.getByLabelText('Tracking number'), {
      target: { value: 'H01AA9988776655' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dispatch shipment' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dispatch shipment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dispatch' }))

    await waitFor(() => expect(createShipment).toHaveBeenCalled())
    expect(createShipment.mock.calls[0][0].trackingId).toBe('H01AA9988776655')
  })

  it('sends none when it was skipped', async () => {
    await reachTracking()

    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dispatch shipment' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dispatch shipment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dispatch' }))

    await waitFor(() => expect(createShipment).toHaveBeenCalled())
    expect(createShipment.mock.calls[0][0].trackingId).toBeUndefined()
  })
})

describe("another client's goods", () => {
  it('is refused by name and nothing is added', async () => {
    lookupByCode
      .mockResolvedValueOnce({ matches: [match(1)] })
      .mockResolvedValueOnce({
        matches: [
          match(1, {
            id: 'p2',
            clientId: 'c2',
            skuCode: 'SKU-999',
            productName: 'Someone Elses Tape',
            client: { id: 'c2', companyName: 'Nestle' },
          }),
        ],
      })

    await startSession()
    typeInto('Barcode or SKU', 'SKU-100')
    await waitFor(() => expect(screen.getByLabelText(/Quantity of Blue Tape/)).toBeTruthy())

    typeInto('Barcode or SKU', 'SKU-999')

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toMatch(/Someone Elses Tape/)
    expect(screen.getByRole('alert').textContent).toMatch(/Nestle/)
    expect(screen.getAllByLabelText(/Quantity of/)).toHaveLength(1)
  })
})

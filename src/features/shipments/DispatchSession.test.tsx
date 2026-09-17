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
  // The reference is the server's to issue, so the only place it exists is in
  // what comes back from this call.
  createShipment.mockResolvedValue({ id: 'sh1', reference: 'SHP-2026-000007' })
})

/** Gets past the tracking step, which is now what gates the goods. */
const startSession = async (trackingId?: string) => {
  renderSession()
  if (trackingId) {
    typeInto('Tracking ID', trackingId)
  } else {
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
  }
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

describe('the tracking step gates the goods', () => {
  it('is what the screen opens on — no product input until it is passed', () => {
    renderSession()

    expect(screen.getByLabelText('Tracking ID')).toBeTruthy()
    expect(screen.getByText(/Step 1 of 3/)).toBeTruthy()
    expect(screen.queryByLabelText('Barcode or SKU')).toBeNull()
  })

  it('never asks for a shipment label — the server issues the reference', () => {
    // The whole point of the replacement: nothing on this screen invites a
    // number to be keyed in that could collide with an existing shipment.
    renderSession()

    expect(screen.queryByLabelText('Shipment label')).toBeNull()
    expect(findByReference).not.toHaveBeenCalled()
  })

  it('can be skipped, and the goods are still reachable', async () => {
    // The courier's number often turns up after the parcel is packed. Skipping
    // is a press, not an omission.
    await startSession()

    expect(screen.getByLabelText('Barcode or SKU')).toBeTruthy()
  })

  it('carries the number into the header once it is entered', async () => {
    await startSession('H01AA9988776655')

    expect(screen.getByText('H01AA9988776655')).toBeTruthy()
  })

  it('can be gone back to from the goods, keeping what was typed', async () => {
    // Skipping must not be a one-way door: the courier's number often turns up
    // a minute after the parcel is packed.
    await startSession('H01AA9988776655')

    fireEvent.click(screen.getByRole('button', { name: 'Edit tracking ID' }))

    await waitFor(() => expect(screen.getByLabelText('Tracking ID')).toBeTruthy())
    expect((screen.getByLabelText('Tracking ID') as HTMLInputElement).value).toBe(
      'H01AA9988776655',
    )
  })

  it('offers to add one from the goods when it was skipped', async () => {
    await startSession()

    fireEvent.click(screen.getByRole('button', { name: 'Add tracking ID' }))

    await waitFor(() => expect(screen.getByLabelText('Tracking ID')).toBeTruthy())
  })
})

describe('what is sent on dispatch', () => {
  /** Tracking, one product, then out of picking. */
  const reachDispatch = async (trackingId?: string) => {
    lookupByCode.mockResolvedValue({ matches: [match(1)] })
    await startSession(trackingId)
    typeInto('Barcode or SKU', 'SKU-100')
    await waitFor(() => expect(screen.getByLabelText(/Quantity of Blue Tape/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dispatch shipment' })).toBeTruthy(),
    )
  }

  const confirm = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Dispatch shipment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dispatch' }))
    await waitFor(() => expect(createShipment).toHaveBeenCalled())
  }

  it('cannot be reached with nothing picked', async () => {
    // Continue is the only way out of picking, and an empty shipment is not one.
    await startSession()

    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('sends no reference — the server issues it', async () => {
    await reachDispatch('H01AA9988776655')

    await confirm()

    expect(createShipment.mock.calls[0][0]).not.toHaveProperty('reference')
  })

  it('reports the reference that came back, not one it made up', async () => {
    const onDispatched = vi.fn()
    lookupByCode.mockResolvedValue({ matches: [match(1)] })
    render(
      <StrictMode>
        <DispatchSession
          clients={[{ id: 'c1', companyName: 'Acme Ltd' }]}
          onDone={vi.fn()}
          onDispatched={onDispatched}
        />
      </StrictMode>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    await waitFor(() => expect(screen.getByLabelText('Barcode or SKU')).toBeTruthy())
    typeInto('Barcode or SKU', 'SKU-100')
    await waitFor(() => expect(screen.getByLabelText(/Quantity of Blue Tape/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dispatch shipment' })).toBeTruthy(),
    )

    await confirm()

    await waitFor(() =>
      expect(onDispatched).toHaveBeenCalledWith({ reference: 'SHP-2026-000007', units: 1 }),
    )
  })

  it('sends the tracking number it was given', async () => {
    await reachDispatch('H01AA9988776655')

    await confirm()

    expect(createShipment.mock.calls[0][0].trackingId).toBe('H01AA9988776655')
  })

  it('sends none when tracking was skipped', async () => {
    await reachDispatch()

    expect(screen.getByText(/no tracking number/)).toBeTruthy()

    await confirm()

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

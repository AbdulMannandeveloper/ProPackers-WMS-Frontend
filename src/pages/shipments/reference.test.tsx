/**
 * How a shipment is named on screen.
 *
 * Phase 20 gave a shipment a `reference` — the label scanned off the parcel,
 * and the thing printed on the invoice line and stored in the ledger. The
 * front-end type never learned about it, so every table went on showing eight
 * characters of the row's uuid: a string that matches nothing on the parcel,
 * nothing on the invoice, and nothing a client could quote back.
 *
 * The uuid assertions matter as much as the reference ones. Rendering both
 * would look right in a screenshot and still leave the operator two identifiers
 * for one shipment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const { getAllShipments, getAllClientServices } = vi.hoisted(() => ({
  getAllShipments: vi.fn(),
  getAllClientServices: vi.fn(),
}))

vi.mock('@/api', () => ({
  shipments: {
    getAllShipments,
    cancelShipment: vi.fn(),
    setShipmentTracking: vi.fn(),
  },
  clientServices: { getAllClientServices },
}))

import ShipmentsPage from './index'
import { useAuthStore } from '@/stores/auth'

const shipment = (overrides = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  reference: 'SHP-000123',
  clientId: 'c1',
  status: 'DISPATCHED' as const,
  trackingId: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  client: { id: 'c1', companyName: 'Acme Ltd', contactName: 'Jo', email: 'jo@acme.test' },
  shipmentItems: [],
  ...overrides,
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ShipmentsPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  getAllShipments.mockResolvedValue([shipment()])
  getAllClientServices.mockResolvedValue([])
  useAuthStore.setState({ role: 'admin' })
})

describe('the shipments table', () => {
  it('names a shipment by its scanned label', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('SHP-000123')).toBeTruthy())
  })

  it('does not show the row id anywhere', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('SHP-000123')).toBeTruthy())

    // Both the full uuid and the eight-character slice this used to render.
    expect(screen.queryByText(/aaaaaaaa/i)).toBeNull()
    expect(document.body.textContent).not.toMatch(/AAAAAAAA/)
  })

  it('names the label in the cancel confirmation', async () => {
    // Cancelling is irreversible, so the identifier in the dialog has to be the
    // one on the parcel the operator is holding. Cancel is only offered on a
    // PENDING shipment, so this one is not dispatched.
    getAllShipments.mockResolvedValue([
      shipment({ status: 'PENDING', reference: 'SHP-000999' }),
    ])
    renderPage()

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButton)

    await waitFor(() =>
      expect(screen.getByText(/Are you sure you want to cancel shipment/)).toBeTruthy(),
    )
    expect(screen.getAllByText('SHP-000999').length).toBeGreaterThan(1)
  })
})

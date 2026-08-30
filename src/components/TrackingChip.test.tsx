/**
 * The tracking chip, rendered.
 *
 * This is the first component test in the project — until now the suite ran
 * with environment: 'node' and could only reach pure functions.
 *
 * The clipboard is stubbed here, so what these prove is the *wiring*: that a
 * click reaches copyText, that a failed copy is reported rather than swallowed,
 * and that the track button opens the right URL for the right courier. Whether
 * the real clipboard works on the staging box is Part 4 of the checklist — jsdom
 * has no clipboard and pretending otherwise would be a false pass.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TrackingChip } from './TrackingChip'

const writeText = vi.fn()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
  vi.stubGlobal('open', vi.fn())
})

describe('copying', () => {
  it('puts the number on the clipboard when clicked', async () => {
    render(<TrackingChip trackingId="H01AA0123456789" courierName="Evri" />)

    await userEvent.click(screen.getByRole('button', { name: /copy tracking number/i }))

    expect(writeText).toHaveBeenCalledWith('H01AA0123456789')
  })

  it('tells the page it succeeded', async () => {
    const onNotify = vi.fn()
    render(
      <TrackingChip trackingId="ABC123" courierName="DPD" onNotify={onNotify} />
    )

    await userEvent.click(screen.getByRole('button', { name: /copy tracking number/i }))

    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('ABC123'), 'success')
  })

  it('reports an error rather than a silent success when the copy fails', async () => {
    // The one that matters: a false "copied" makes an operator paste the
    // previous parcel's number onto this label.
    writeText.mockRejectedValue(new Error('denied'))
    vi.stubGlobal('document', document)
    document.execCommand = vi.fn().mockReturnValue(false)

    const onNotify = vi.fn()
    render(<TrackingChip trackingId="ABC123" courierName="DPD" onNotify={onNotify} />)

    await userEvent.click(screen.getByRole('button', { name: /copy tracking number/i }))

    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('Could not copy'), 'error')
  })

  it('shows the number itself', () => {
    render(<TrackingChip trackingId="H01AA0123456789" courierName="Evri" />)
    expect(screen.getByText('H01AA0123456789')).toBeInTheDocument()
  })
})

describe('tracking', () => {
  it('opens the courier deep link for a courier that supports one', async () => {
    render(<TrackingChip trackingId="H01AA0123456789" courierName="DPD" />)

    await userEvent.click(screen.getByRole('button', { name: /track this parcel/i }))

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('H01AA0123456789'),
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('copies first for Evri, whose site cannot take the number in a url', async () => {
    // Verified against evri.com: the path form redirects to the homepage and no
    // query parameter pre-fills the box. So the paste has to be ready.
    render(<TrackingChip trackingId="H01AA0123456789" courierName="Evri" />)

    await userEvent.click(screen.getByRole('button', { name: /copy and open evri/i }))

    expect(writeText).toHaveBeenCalledWith('H01AA0123456789')
    expect(window.open).toHaveBeenCalledWith(
      'https://www.evri.com/track-a-parcel',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('says "copy and open" for those couriers, not "track"', () => {
    render(<TrackingChip trackingId="ABC123" courierName="Royal Mail" />)
    expect(
      screen.getByRole('button', { name: /copy and open royal mail/i })
    ).toBeInTheDocument()
  })

  it('is disabled for a courier no longer in the registry', async () => {
    // Old shipments keep whatever courier name was saved. The number still
    // shows; only the track button goes away.
    render(<TrackingChip trackingId="ABC123" courierName="Hermes" />)

    const track = screen.getByRole('button', { name: /no tracking page configured/i })
    expect(track).toBeDisabled()
    expect(screen.getByText('ABC123')).toBeInTheDocument()

    await userEvent.click(track)
    expect(window.open).not.toHaveBeenCalled()
  })
})

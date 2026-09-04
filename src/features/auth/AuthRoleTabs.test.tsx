/**
 * Switching between staff and client sign-in.
 *
 * This was a text link buried in the card footer, which is exactly what people
 * missed. It is now a segmented control — but still two real routes underneath,
 * because the pages genuinely differ after sign-in and each guards its own role
 * on the verify response.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { AuthRoleTabs } from './AuthRoleTabs'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthRoleTabs />
    </MemoryRouter>,
  )

const staff = () => screen.getByRole('link', { name: 'Staff' })
const client = () => screen.getByRole('link', { name: 'Client' })

describe('which segment is selected', () => {
  it('marks Staff on the staff route', () => {
    renderAt('/auth/login')

    expect(staff().getAttribute('aria-current')).toBe('page')
    expect(client().getAttribute('aria-current')).toBeNull()
  })

  it('marks Client on the client route', () => {
    renderAt('/auth/client-login')

    expect(client().getAttribute('aria-current')).toBe('page')
    expect(staff().getAttribute('aria-current')).toBeNull()
  })

  it('styles the selected one differently from the other', () => {
    // The aria state is for screen readers; sighted users need the fill.
    renderAt('/auth/login')

    expect(staff().className).toContain('auth-role-tab--active')
    expect(client().className).toContain('auth-role-tab--idle')
  })
})

describe('they are real links', () => {
  it('each points at its own route', () => {
    // Buttons with onClick would break middle-click, open-in-new-tab and
    // bookmarking — and both sign-in pages are things people bookmark.
    renderAt('/auth/login')

    expect(staff().getAttribute('href')).toBe('/auth/login')
    expect(client().getAttribute('href')).toBe('/auth/client-login')
  })

  it('offers both segments whichever page you are on', () => {
    renderAt('/auth/client-login')

    expect(staff()).toBeTruthy()
    expect(client()).toBeTruthy()
  })
})

describe('the control describes itself', () => {
  it('is a labelled navigation region', () => {
    renderAt('/auth/login')
    expect(screen.getByRole('navigation', { name: /who is signing in/i })).toBeTruthy()
  })
})

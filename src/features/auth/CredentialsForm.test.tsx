/**
 * The credentials step.
 *
 * The part worth pinning is not visible in a screenshot: neither sign-in page
 * carried a single `autoComplete` attribute, so no password manager could fill
 * either form and every sign-in was typed out by hand. Labels were also
 * unassociated, so clicking one did nothing and a screen reader announced the
 * inputs unnamed.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CredentialsForm } from './CredentialsForm'

const setup = (overrides: Partial<React.ComponentProps<typeof CredentialsForm>> = {}) => {
  const props: React.ComponentProps<typeof CredentialsForm> = {
    idPrefix: 'test',
    identifierLabel: 'Email or username',
    identifierPlaceholder: 'daniel.hughes',
    identifier: '',
    onIdentifierChange: vi.fn(),
    password: '',
    onPasswordChange: vi.fn(),
    loading: false,
    submitLabel: 'Sign in',
    onSubmit: vi.fn((e) => e.preventDefault()),
    ...overrides,
  }
  const utils = render(<CredentialsForm {...props} />)
  return { ...utils, props }
}

const passwordField = () => screen.getByLabelText(/^password$/i) as HTMLInputElement

describe('password managers can fill it', () => {
  it('marks the identifier as the username', () => {
    setup()
    expect(screen.getByLabelText(/email or username/i).getAttribute('autocomplete')).toBe(
      'username',
    )
  })

  it('marks the password as the current password', () => {
    setup()
    expect(passwordField().getAttribute('autocomplete')).toBe('current-password')
  })
})

describe('the labels work', () => {
  it('every field is reachable by its label', () => {
    // getByLabelText throws when a label is not associated, so this is the assertion.
    setup()
    expect(screen.getByLabelText(/email or username/i)).toBeTruthy()
    expect(passwordField()).toBeTruthy()
  })

  it('gives the two pages distinct ids so both can coexist', () => {
    // Staff and client forms are separate routes, but sharing ids would break
    // label association the moment anything rendered them together.
    const { unmount } = setup({ idPrefix: 'staff' })
    expect(screen.getByLabelText(/email or username/i).id).toBe('staff-identifier')
    unmount()

    setup({ idPrefix: 'client' })
    expect(screen.getByLabelText(/email or username/i).id).toBe('client-identifier')
  })
})

describe('showing the password', () => {
  it('starts hidden', () => {
    setup()
    expect(passwordField().type).toBe('password')
  })

  it('toggles to visible and back', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordField().type).toBe('text')

    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(passwordField().type).toBe('password')
  })

  it('names the action rather than relying on the icon', () => {
    // An icon-only button announces nothing to a screen reader.
    setup()
    expect(screen.getByRole('button', { name: /show password/i })).toBeTruthy()
  })
})

describe('while signing in', () => {
  it('disables the fields and the button', () => {
    setup({ loading: true })

    expect(screen.getByLabelText(/email or username/i)).toBeDisabled()
    expect(passwordField()).toBeDisabled()
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
  })
})

describe('typing', () => {
  it('reports changes upward', () => {
    const onIdentifierChange = vi.fn()
    const onPasswordChange = vi.fn()
    setup({ onIdentifierChange, onPasswordChange })

    fireEvent.change(screen.getByLabelText(/email or username/i), {
      target: { value: 'daniel.hughes' },
    })
    fireEvent.change(passwordField(), { target: { value: 'x' } })

    expect(onIdentifierChange).toHaveBeenCalledWith('daniel.hughes')
    expect(onPasswordChange).toHaveBeenCalledWith('x')
  })
})

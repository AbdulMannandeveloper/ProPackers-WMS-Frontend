/**
 * The card, and when the role switcher is allowed to appear.
 *
 * The tabs must be absent on the code step: a code has already been sent
 * against one role, and switching there would strand the user mid-flow with a
 * live code for the account they just left. The pages express that by passing
 * `tabs` only on step one, so the panel has to honour omission.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AuthPanel } from './AuthPanel'

describe('the role switcher slot', () => {
  it('renders what it is given', () => {
    render(
      <AuthPanel title="Welcome back" subtitle="Sign in." tabs={<nav>switcher</nav>}>
        <form />
      </AuthPanel>,
    )

    expect(screen.getByText('switcher')).toBeTruthy()
  })

  it('renders nothing when omitted, which is what keeps it off the code step', () => {
    render(
      <AuthPanel title="Check your email" subtitle="One more step.">
        <form />
      </AuthPanel>,
    )

    expect(screen.queryByText('switcher')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('what the card always shows', () => {
  it('shows the heading and subtitle', () => {
    render(
      <AuthPanel title="Client sign in" subtitle="View your invoices.">
        <form />
      </AuthPanel>,
    )

    expect(screen.getByRole('heading', { name: 'Client sign in' })).toBeTruthy()
    expect(screen.getByText('View your invoices.')).toBeTruthy()
  })

  it('does not carry its own brand mark', () => {
    // The brand lives once in AuthLayout above the card. Two of them was the
    // visible bug when admin-signup and setup-password still drew their own.
    const { container } = render(
      <AuthPanel title="x" subtitle="y">
        <form />
      </AuthPanel>,
    )

    expect(container.querySelector('img')).toBeNull()
  })
})

describe('errors', () => {
  it('announces a failure rather than showing it silently', () => {
    render(
      <AuthPanel title="x" subtitle="y" error="That password is not right.">
        <form />
      </AuthPanel>,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('That password is not right.')
  })

  it('shows no alert region when there is no error', () => {
    render(
      <AuthPanel title="x" subtitle="y" error={null}>
        <form />
      </AuthPanel>,
    )

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

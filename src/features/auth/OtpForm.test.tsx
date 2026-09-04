/**
 * The one-time code step.
 *
 * The old control was a plain text input with letter-spacing: no numeric
 * keypad on mobile, no platform autofill, no paste tolerance, and you had to
 * reach for a button after typing the last digit you were just told to type.
 *
 * One field rather than six boxes is deliberate — six break pasting and defeat
 * `autocomplete="one-time-code"`, which is the whole mechanism that lets iOS
 * and macOS fill the code for you.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { OtpForm, normaliseOtp } from './OtpForm'

const setup = (overrides: Partial<React.ComponentProps<typeof OtpForm>> = {}) => {
  const props: React.ComponentProps<typeof OtpForm> = {
    idPrefix: 'test',
    otp: '',
    onOtpChange: vi.fn(),
    sentTo: 'daniel@example.com',
    verifying: false,
    onSubmit: vi.fn((e) => e.preventDefault()),
    onBack: vi.fn(),
    onResend: vi.fn(),
    resending: false,
    ...overrides,
  }
  const utils = render(<OtpForm {...props} />)
  return { ...utils, props }
}

const field = () => screen.getByLabelText(/one-time code/i) as HTMLInputElement



describe('normalising what gets typed or pasted', () => {
  it('keeps digits and drops everything else', () => {
    // Codes get pasted out of an email as "123 456" or "Code: 123456".
    expect(normaliseOtp('123 456')).toBe('123456')
    expect(normaliseOtp('Code: 123456')).toBe('123456')
    expect(normaliseOtp('12-34-56')).toBe('123456')
  })

  it('keeps a leading zero', () => {
    // The reason this is type="text" and not type="number": a number input
    // would render 012345 as 12345 and the code would be rejected.
    expect(normaliseOtp('012345')).toBe('012345')
  })

  it('never exceeds six digits', () => {
    expect(normaliseOtp('1234567890')).toBe('123456')
  })
})

describe('the field itself', () => {
  it('asks the platform to autofill the code', () => {
    // Without one-time-code, iOS and macOS will not offer the code at all.
    setup()
    expect(field().getAttribute('autocomplete')).toBe('one-time-code')
  })

  it('brings up a numeric keypad without being a number input', () => {
    setup()
    expect(field().getAttribute('inputmode')).toBe('numeric')
    expect(field().getAttribute('type')).toBe('text')
  })

  it('caps entry at six', () => {
    setup()
    expect(field().getAttribute('maxlength')).toBe('6')
  })

  it('says which inbox the code went to', () => {
    // The old copy said "your email or device", which helps nobody.
    setup({ sentTo: 'daniel@example.com' })
    expect(screen.getByText(/daniel@example\.com/)).toBeTruthy()
  })
})

describe('submitting', () => {
  it('submits itself once six digits are in', () => {
    const onSubmit = vi.fn((e) => e.preventDefault())
    setup({ otp: '123456', onSubmit })

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit on five', () => {
    // Auto-submitting early would burn the code and lock the user out.
    const onSubmit = vi.fn((e) => e.preventDefault())
    setup({ otp: '12345', onSubmit })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit again while a verify is already running', () => {
    const onSubmit = vi.fn((e) => e.preventDefault())
    setup({ otp: '123456', verifying: true, onSubmit })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('passes normalised input up, not raw', () => {
    const onOtpChange = vi.fn()
    setup({ onOtpChange })

    fireEvent.change(field(), { target: { value: '12 34 56' } })
    expect(onOtpChange).toHaveBeenCalledWith('123456')
  })
})

describe('resending', () => {
  it('is on a cooldown at first, since a code was just sent', () => {
    setup()
    const button = screen.getByRole('button', { name: /resend in/i })
    expect(button).toBeDisabled()
  })

  it('becomes available once the cooldown runs out', async () => {
    // A one-second cooldown rather than sitting through thirty; the countdown
    // itself is the same code path.
    setup({ cooldownSeconds: 1 })

    await waitFor(
      () => expect(screen.getByRole('button', { name: /^resend code$/i })).toBeTruthy(),
      { timeout: 3000 },
    )
    expect(screen.getByRole('button', { name: /^resend code$/i })).not.toBeDisabled()
  })

  it('counts down before offering itself', async () => {
    setup({ cooldownSeconds: 5 })
    expect(screen.getByRole('button', { name: /resend in 5s/i })).toBeDisabled()
  })

  it('calls back when pressed after the cooldown', async () => {
    const onResend = vi.fn()
    setup({ onResend, cooldownSeconds: 1 })

    const button = await screen.findByRole('button', { name: /^resend code$/i }, { timeout: 3000 })
    fireEvent.click(button)

    expect(onResend).toHaveBeenCalledTimes(1)
  })

  it('is hidden entirely when no resend handler is given', () => {
    setup({ onResend: undefined })
    expect(screen.queryByRole('button', { name: /resend/i })).toBeNull()
  })
})

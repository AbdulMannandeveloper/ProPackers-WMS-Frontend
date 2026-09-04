import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Step two: the emailed code.
 *
 * One input, not six boxes. Six boxes look like the obvious answer and are the
 * wrong one — they break pasting and defeat platform autofill, which is the
 * whole point of `autocomplete="one-time-code"`. Twilio and Cloud Four both land
 * on a single field for exactly that reason.
 *
 * `type="text"` with `inputMode="numeric"`, never `type="number"`: a number
 * input strips a leading zero, and "012345" is a perfectly ordinary code.
 */

export const OTP_LENGTH = 6

/** Digits only, capped — so a pasted "123 456" or "code: 123456" still works. */
export const normaliseOtp = (raw: string) =>
  raw.replace(/\D/g, '').slice(0, OTP_LENGTH)

type Props = {
  idPrefix: string
  otp: string
  onOtpChange: (value: string) => void
  /** Shown so the user knows which inbox to look in. */
  sentTo?: string | null
  verifying: boolean
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
  /** Re-sends by replaying the login call; there is no separate endpoint. */
  onResend?: () => void | Promise<void>
  resending?: boolean
  /** Seconds before "resend" is offered. Overridable so tests need not sit through 30. */
  cooldownSeconds?: number
}

const RESEND_COOLDOWN_SECONDS = 30

export function OtpForm({
  idPrefix,
  otp,
  onOtpChange,
  sentTo,
  verifying,
  onSubmit,
  onBack,
  onResend,
  resending = false,
  cooldownSeconds = RESEND_COOLDOWN_SECONDS,
}: Props) {
  const otpId = `${idPrefix}-otp`
  const formRef = useRef<HTMLFormElement>(null)
  const [cooldown, setCooldown] = useState(cooldownSeconds)

  // Start the clock as soon as the step appears: a code was just sent, so
  // offering "resend" immediately invites a second one nobody needs.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  // Submit itself once the code is complete, rather than making someone reach
  // for a button after typing the last digit they were told to type.
  useEffect(() => {
    if (otp.length === OTP_LENGTH && !verifying) {
      formRef.current?.requestSubmit()
    }
  }, [otp, verifying])

  const resend = async () => {
    if (!onResend || cooldown > 0 || resending) return
    await onResend()
    setCooldown(cooldownSeconds)
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      <div className="auth-field">
        <label className="auth-label" htmlFor={otpId}>
          One-time code
        </label>
        <p className="auth-helper-text mb-2">
          {sentTo ? (
            <>
              Sent to <span className="font-medium text-slate-700">{sentTo}</span>.
            </>
          ) : (
            'Enter the code we emailed you.'
          )}
        </p>
        <input
          id={otpId}
          // Never type="number": it drops a leading zero, and 012345 is a valid code.
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={OTP_LENGTH}
          className="auth-input auth-input--code"
          placeholder="000000"
          value={otp}
          onChange={(e) => onOtpChange(normaliseOtp(e.target.value))}
          disabled={verifying}
          autoFocus
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          type="button"
          onClick={onBack}
          className="auth-button--secondary"
          disabled={verifying}
        >
          Back
        </Button>
        <Button type="submit" className="auth-button" loading={verifying}>
          {verifying ? 'Verifying…' : 'Verify'}
        </Button>
      </div>

      {onResend ? (
        <p className="text-center text-sm text-slate-500">
          Didn't get it?{' '}
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0 || resending}
            className="auth-link disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
          >
            {resending
              ? 'Sending…'
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : 'Resend code'}
          </button>
        </p>
      ) : null}
    </form>
  )
}

export default OtpForm

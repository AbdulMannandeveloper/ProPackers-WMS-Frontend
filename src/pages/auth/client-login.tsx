import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { auth as apiAuth } from '@/api'
import { AuthPanel } from '@/features/auth/AuthPanel'
import { AuthSteps } from '@/features/auth/AuthSteps'
import { CredentialsForm } from '@/features/auth/CredentialsForm'
import { OtpForm } from '@/features/auth/OtpForm'
import { errorMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'

export default function ClientLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [showOtp, setShowOtp] = useState(false)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUserId)
  const setToken = useAuthStore((s) => s.setToken)
  const setRole = useAuthStore((s) => s.setRole)
  const setDisplayName = useAuthStore((s) => s.setDisplayName)

  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setError('')
    setIsLoading(true)

    try {
      const res: any = await apiAuth.login({ identifier: email, password })
      setUserId(res.userId)
      setOtp('')
      setShowOtp(true)
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in.'))
    } finally {
      setIsLoading(false)
    }
  }

  /** Replays the login call, which is what issued the code in the first place. */
  const handleResend = async () => {
    if (isResending) return
    setError('')
    setIsResending(true)
    try {
      const res: any = await apiAuth.login({ identifier: email, password })
      setUserId(res.userId)
      setOtp('')
    } catch (err) {
      setError(errorMessage(err, 'Could not send another code.'))
    } finally {
      setIsResending(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || isVerifying) return
    setError('')
    setIsVerifying(true)

    try {
      const res: any = await apiAuth.verifyOtp({ userId, otp })
      if (!res.verified) return

      if (res.role !== 'client') {
        setToken(null)
        setUser(null)
        setRole(null)
        setError('Suspicious access detected: this login page is for clients only.')
        return
      }

      setToken(res.token)
      setUser(userId)
      setRole(res.role)
      const name = [res.firstName, res.lastName].filter(Boolean).join(' ').trim() || null
      setDisplayName(name)
      navigate('/client')
    } catch (err) {
      setError(errorMessage(err, 'OTP verification failed.'))
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <AuthPanel
      title={showOtp ? 'Check your email' : 'Client sign in'}
      subtitle={
        showOtp
          ? 'One more step to reach your account.'
          : // The old copy said "email and OTP" while the form asked for a
            // password, which read as a bug to anyone paying attention.
            'View your inventory, shipments and invoices.'
      }
      error={error || null}
      step={<AuthSteps current={showOtp ? 2 : 1} />}
      footer={
        <>
          <p className="auth-footer__note">Staff member?</p>
          <Link to="/auth/login" className="auth-link">
            Staff sign in
          </Link>
        </>
      }
    >
      {!showOtp ? (
        <CredentialsForm
          idPrefix="client"
          identifierLabel="Email"
          identifierPlaceholder="client@example.com"
          identifierType="email"
          identifier={email}
          onIdentifierChange={setEmail}
          password={password}
          onPasswordChange={setPassword}
          loading={isLoading}
          submitLabel="Sign in"
          onSubmit={handleSubmit}
        />
      ) : (
        <OtpForm
          idPrefix="client"
          otp={otp}
          onOtpChange={setOtp}
          sentTo={email || null}
          verifying={isVerifying}
          onSubmit={handleVerify}
          onBack={() => {
            setShowOtp(false)
            setError('')
          }}
          onResend={handleResend}
          resending={isResending}
        />
      )}
    </AuthPanel>
  )
}

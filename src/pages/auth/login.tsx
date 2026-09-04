import { useState } from 'react'
import { useNavigate } from 'react-router'

import { auth as apiAuth } from '@/api'
import { AuthPanel } from '@/features/auth/AuthPanel'
import { AuthRoleTabs } from '@/features/auth/AuthRoleTabs'
import { AuthSteps } from '@/features/auth/AuthSteps'
import { CredentialsForm } from '@/features/auth/CredentialsForm'
import { OtpForm } from '@/features/auth/OtpForm'
import { errorMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'

export default function LoginPage() {
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
      // login sends OTP; save returned userId and show OTP input
      setUserId(res.userId)
      setOtp('')
      setShowOtp(true)
    } catch (err) {
      // errorMessage reads the server's own sentence; err.message here is
      // axios's "Request failed with status code 400".
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
      if (res.verified) {
        if (res.role === 'client') {
          setToken(null)
          setUser(null)
          setRole(null)
          setError('Invalid user for this login.')
          return
        }

        // store the signed session token returned by the backend
        setToken(res.token)
        setUser(userId)
        if (res.role) setRole(res.role)
        // display name comes straight from the verify response (no directory fetch)
        const name = [res.firstName, res.lastName].filter(Boolean).join(' ').trim() || null
        setDisplayName(name)

        // Automatically record Clock-In if it's an employee or admin
        if (res.role === 'admin' || res.role === 'employee') {
          try {
            const { attendance: attendanceApi } = await import('@/api')
            const logs = await attendanceApi.getAttendanceLogByField('userId', userId)
            const todayStr = new Date().toISOString().split('T')[0]
            const hasTodayLog = logs.some((l) => l.date && l.date.split('T')[0] === todayStr)
            if (!hasTodayLog) {
              await attendanceApi.createAttendanceLog({
                userId,
                loginTimestamp: new Date().toISOString(),
                date: `${todayStr}T00:00:00.000Z`,
              })
            }
          } catch (err) {
            console.error('Failed to auto clock-in on login:', err)
          }
        }

        // redirect to app
        navigate('/app')
      }
    } catch (err) {
      setError(errorMessage(err, 'OTP verification failed.'))
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <AuthPanel
      title={showOtp ? 'Check your email' : 'Welcome back'}
      subtitle={
        showOtp
          ? 'One more step to reach your workspace.'
          : 'Sign in to your ProPackers workspace.'
      }
      error={error || null}
      step={<AuthSteps current={showOtp ? 2 : 1} />}
      tabs={
        /* Not on the code step: switching role with a code already sent
           would strand you mid-flow. */
        showOtp ? undefined : <AuthRoleTabs />
      }
      footer={
        <p className="auth-footer__note">Admins and employees use the same sign in.</p>
      }
    >
      {!showOtp ? (
        <CredentialsForm
          idPrefix="staff"
          identifierLabel="Email or username"
          identifierPlaceholder="daniel.hughes"
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
          idPrefix="staff"
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

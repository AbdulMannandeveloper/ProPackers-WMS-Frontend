import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router'
import { auth as apiAuth } from '@/api'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setError('')
    setIsLoading(true)

    try {
      const res: any = await apiAuth.login({ identifier: email, password })
      // login sends OTP; save returned userId and show OTP input
      setUserId(res.userId)
      setShowOtp(true)
    } catch (err) {
      setError((err as any)?.response?.data?.error || (err as any)?.message || 'Unable to sign in.')
    } finally {
      setIsLoading(false)
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
      setError((err as any)?.response?.data?.error || (err as any)?.message || 'OTP verification failed.')
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="app-auth">
      <div className="app-auth__panel p-6 sm:p-7 lg:p-8">
        <div className="app-auth__brand text-left">
          <div className="app-auth__brand-mark !mx-0">
            <img src="/Logo.png" alt="logo" className="h-7 w-7 object-contain" />
          </div>
          <h1 className="auth-hero-title mt-4">Welcome back</h1>
          <p className="auth-hero-subtitle">Sign in to your workspace</p>
        </div>

        {error ? <div className="mt-5 auth-alert auth-alert--error">{error}</div> : null}

        <div className="auth-divider"><span>Secure sign in</span></div>

        {!showOtp ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="auth-label">Email or Username</label>
              <input className="auth-input" placeholder="daniel.hughes" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
            </div>
            <div>
              <label className="auth-label">Password</label>
              <input type="password" className="auth-input" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
            </div>

            <Button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="auth-label">One-time password</label>
              <input className="auth-input tracking-[0.35em] text-center text-lg" placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value)} disabled={isVerifying} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" type="button" onClick={() => setShowOtp(false)} className="auth-button--secondary" disabled={isVerifying}>
                Back
              </Button>
              <Button type="submit" className="auth-button" disabled={isVerifying}>
                {isVerifying ? 'Verifying...' : 'Verify OTP'}
              </Button>
            </div>
          </form>
        )}

        <div className="mt-5 flex items-center justify-between gap-4 text-sm text-slate-500">
          <p>Admin and employee use the same login.</p>
          <Link to="/auth/client-login" className="auth-link whitespace-nowrap">
            Client login
          </Link>
        </div>
      </div>
    </div>
  )
}

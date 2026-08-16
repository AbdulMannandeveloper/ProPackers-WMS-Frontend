import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { auth as apiAuth } from '@/api'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setError('')
    setIsLoading(true)

    try {
      const res: any = await apiAuth.login({ identifier: email, password })
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
          <h1 className="auth-hero-title mt-4">Client sign in</h1>
          <p className="auth-hero-subtitle">Access your services with email and OTP</p>
        </div>

        {error ? <div className="mt-5 auth-alert auth-alert--error">{error}</div> : null}

        <div className="auth-divider"><span>Client sign in</span></div>

        {!showOtp ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="auth-label">Email</label>
              <input className="auth-input" placeholder="client@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
            </div>
            <div>
              <label className="auth-label">Password</label>
              <input type="password" className="auth-input" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
            </div>

            <Button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Continue to OTP'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="auth-card">
              <div className="text-sm font-medium text-slate-900">OTP verification</div>
              <p className="mt-1 text-sm text-slate-600">Enter the one-time code sent to your email or device.</p>
            </div>
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

        <div className="mt-5 text-sm text-slate-500">
          <Link to="/auth/login" className="auth-link">
            Back to staff sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

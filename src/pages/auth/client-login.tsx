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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const res: any = await apiAuth.login({ identifier: email, password })
      setUserId(res.userId)
      setShowOtp(true)
    } catch (err) {
      setError((err as any)?.response?.data?.error || (err as any)?.message || 'Unable to sign in.')
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setError('')

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

      setToken(userId)
      setUser(userId)
      setRole(res.role)
      navigate('/client')
    } catch (err) {
      setError((err as any)?.response?.data?.error || (err as any)?.message || 'OTP verification failed.')
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-md">
      <h1 className="text-2xl font-semibold mb-4">Client Sign in</h1>
      {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <p className="mb-4 text-sm text-muted-foreground">
        Staff account?{' '}
        <Link to="/auth/login" className="underline underline-offset-4">
          go to staff sign in
        </Link>
      </p>

      {!showOtp ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input className="mt-1 block w-full border rounded p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input type="password" className="mt-1 block w-full border rounded p-2" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <div className="flex justify-end">
            <Button type="submit">Sign in</Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Enter OTP</label>
            <input className="mt-1 block w-full border rounded p-2" value={otp} onChange={(e) => setOtp(e.target.value)} />
          </div>
          <div className="flex justify-between">
            <Button variant="secondary" type="button" onClick={() => setShowOtp(false)}>Back</Button>
            <Button type="submit">Verify</Button>
          </div>
        </form>
      )}
    </div>
  )
}

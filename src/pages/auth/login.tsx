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
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUserId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const res: any = await apiAuth.login({ identifier: email, password })
      // login sends OTP; save returned userId and show OTP input
      setUserId(res.userId)
      setShowOtp(true)
    } catch (err) {
      // TODO: show error
      // console.error(err)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    try {
      const res: any = await apiAuth.verifyOtp({ userId, otp })
      if (res.verified) {
        // store userId as "logged in" identifier
        setUser(userId)
        // redirect to app
        navigate('/app')
      }
    } catch (err) {
      // TODO: show error
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-md">
      <h1 className="text-2xl font-semibold mb-4">Sign in</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        First time here?{' '}
        <Link to="/auth/admin-signup" className="underline underline-offset-4">
          create the first admin account
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
            <Button variant="secondary" onClick={() => setShowOtp(false)}>Back</Button>
            <Button type="submit">Verify</Button>
          </div>
        </form>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { auth as apiAuth } from '@/api'

export default function AdminSignupPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const response = await apiAuth.requestAdminSignupOtp({
        firstName,
        lastName,
        username: username || undefined,
        email,
      })

      setMessage(
        response?.message ??
          'Invitation sent. Check your email to set your password and complete the first admin signup.',
      )
      navigate('/auth/login')
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to submit admin signup request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-auth">
      <div className="app-auth__panel p-6 sm:p-7 lg:p-8">
        <div className="app-auth__brand text-left">
          <div className="app-auth__brand-mark !mx-0">
            <img src="/Logo.png" alt="logo" className="h-7 w-7 object-contain" />
          </div>
          <h1 className="auth-hero-title mt-4">Create admin account</h1>
          <p className="auth-hero-subtitle">Set up the first administrator</p>
        </div>
        <div className="auth-note mt-4">This invitation is only used once during initial setup.</div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="auth-label">First name</label>
              <input className="auth-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label className="auth-label">Last name</label>
              <input className="auth-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="auth-label">Username</label>
            <input className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>

          <div>
            <label className="auth-label">Email</label>
            <input type="email" className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
          {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}

          <div className="grid grid-cols-2 gap-3">
            <Link to="/auth/login" className="auth-button--secondary">
              Back
            </Link>
            <Button type="submit" disabled={loading} className="auth-button">
              {loading ? 'Submitting…' : 'Create admin'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
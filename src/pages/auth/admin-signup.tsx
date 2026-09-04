import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { AuthPanel } from '@/features/auth/AuthPanel'
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
    <AuthPanel
      title="Create admin account"
      subtitle="Set up the first administrator."
      error={error || null}
    >
      <div className="auth-note mb-5">
        This invitation is only used once during initial setup.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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

      {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/auth/login" className="auth-button--secondary">
          Back
        </Link>
        <Button type="submit" loading={loading} className="auth-button">
          {loading ? 'Submitting…' : 'Create admin'}
        </Button>
      </div>
    </form>
    </AuthPanel>
  )
}
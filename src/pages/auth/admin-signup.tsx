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
    <div className="rounded-xl bg-white p-6 shadow-md">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">First admin signup</h1>
        <p className="text-sm text-muted-foreground">
          This page works only until the first admin account exists. After that, the backend will reject new submissions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">First name</label>
            <input className="mt-1 block w-full rounded border p-2" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium">Last name</label>
            <input className="mt-1 block w-full rounded border p-2" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Username</label>
          <input className="mt-1 block w-full rounded border p-2" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium">Email</label>
          <input type="email" className="mt-1 block w-full rounded border p-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

        <div className="flex items-center justify-between gap-3">
          <Link to="/auth/login" className="text-sm text-muted-foreground underline underline-offset-4">
            Back to login
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? 'Submitting…' : 'Create first admin'}
          </Button>
        </div>
      </form>
    </div>
  )
}
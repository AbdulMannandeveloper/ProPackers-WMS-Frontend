import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { auth as apiAuth } from '@/api'

type PreviewInfo = {
  userId: string
  firstName: string
  lastName: string
  username?: string | null
  email: string
  role: string
}

export default function SetupPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewInfo | null>(null)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const token = searchParams.get('token') ?? ''

  useEffect(() => {
    const loadPreview = async () => {
      if (!token) return

      setPreviewLoading(true)
      setError('')

      try {
        const data = await apiAuth.getSetupPasswordPreview(token)
        setPreview(data)
      } catch (err: any) {
        setPreview(null)
        setError(err?.response?.data?.error || err?.message || 'Unable to load invitation details.')
      } finally {
        setPreviewLoading(false)
      }
    }

    void loadPreview()
  }, [token])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!token) {
      setError('Missing setup token. Please use the link from your email.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const response = await apiAuth.setupPassword({ token, password })
      setMessage(response?.message ?? 'Password set successfully. You can now sign in.')
      setTimeout(() => {
        navigate('/auth/login')
      }, 1200)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to set password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-md">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Set your password</h1>
        <p className="text-sm text-muted-foreground">
          Create a password to complete your account setup.
        </p>
      </div>

      <div className="mb-6 rounded-lg border bg-slate-50 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Account details</h2>
        {previewLoading ? (
          <div className="text-sm text-slate-500">Loading invitation details…</div>
        ) : preview ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">First name</dt>
              <dd className="font-medium text-slate-900">{preview.firstName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last name</dt>
              <dd className="font-medium text-slate-900">{preview.lastName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Username</dt>
              <dd className="font-medium text-slate-900">{preview.username || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{preview.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Role</dt>
              <dd className="font-medium text-slate-900">{preview.role}</dd>
            </div>
          </dl>
        ) : (
          <div className="text-sm text-slate-500">No invitation details loaded yet.</div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            className="mt-1 block w-full rounded border p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Confirm password</label>
          <input
            type="password"
            className="mt-1 block w-full rounded border p-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {!token ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            No token found in the URL. Open the email link again.
          </div>
        ) : null}

        {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

        <div className="flex items-center justify-between gap-3">
          <Link to="/auth/login" className="text-sm text-muted-foreground underline underline-offset-4">
            Back to login
          </Link>
          <Button type="submit" disabled={loading || !token}>
            {loading ? 'Saving…' : 'Set password'}
          </Button>
        </div>
      </form>
    </div>
  )
}
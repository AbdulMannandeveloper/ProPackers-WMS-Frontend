import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { AuthPanel } from '@/features/auth/AuthPanel'
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
    <AuthPanel
      title="Set your password"
      subtitle="Complete your account setup."
      error={error || null}
    >
      <div className="auth-note">
          This link is temporary and can only be used once to finish your account activation.
        </div>
      <div className="auth-preview mt-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Invitation details</div>
          {previewLoading ? (
            <div className="text-sm text-slate-500">Loading invitation details…</div>
          ) : preview ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="auth-label">First name</dt>
                <dd className="mt-1 font-medium text-slate-900">{preview.firstName}</dd>
              </div>
              <div>
                <dt className="auth-label">Last name</dt>
                <dd className="mt-1 font-medium text-slate-900">{preview.lastName}</dd>
              </div>
              <div>
                <dt className="auth-label">Username</dt>
                <dd className="mt-1 font-medium text-slate-900">{preview.username || '—'}</dd>
              </div>
              <div>
                <dt className="auth-label">Email</dt>
                <dd className="mt-1 font-medium text-slate-900">{preview.email}</dd>
              </div>
              <div>
                <dt className="auth-label">Role</dt>
                <dd className="mt-1 font-medium text-slate-900">{preview.role}</dd>
              </div>
            </dl>
          ) : (
            <div className="text-sm text-slate-500">No invitation details loaded yet.</div>
          )}
        </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="auth-label">Password</label>
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="auth-label">Confirm password</label>
            <input
              type="password"
              className="auth-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {!token ? (
            <div className="auth-alert auth-alert--error">
              No token found in the URL. Open the email link again.
            </div>
          ) : null}

          {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}

          <div className="grid grid-cols-2 gap-3">
            <Link to="/auth/login" className="auth-button--secondary">
              Back
            </Link>
            <Button type="submit" loading={loading} disabled={!token} className="auth-button">
              {loading ? 'Saving…' : 'Set password'}
            </Button>
          </div>
      </form>
    </AuthPanel>
  )
}
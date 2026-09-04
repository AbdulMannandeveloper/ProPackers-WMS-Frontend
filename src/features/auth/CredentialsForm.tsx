import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Step one: who you are and your password.
 *
 * The visible change is the styling; the change that people will actually feel
 * is `autoComplete`. Neither page had any, so no password manager could fill
 * either form — every sign-in was typed by hand. That is invisible in a
 * screenshot and is the most annoying thing about these pages.
 */

type Props = {
  /** Distinguishes the two pages' fields, since both can be in the DOM in tests. */
  idPrefix: string
  identifierLabel: string
  identifierPlaceholder: string
  /** Staff sign in with a username or an email, so that page stays type="text". */
  identifierType?: 'text' | 'email'
  identifier: string
  onIdentifierChange: (value: string) => void
  password: string
  onPasswordChange: (value: string) => void
  loading: boolean
  submitLabel: string
  onSubmit: (e: React.FormEvent) => void
}

export function CredentialsForm({
  idPrefix,
  identifierLabel,
  identifierPlaceholder,
  identifierType = 'text',
  identifier,
  onIdentifierChange,
  password,
  onPasswordChange,
  loading,
  submitLabel,
  onSubmit,
}: Props) {
  const [revealed, setRevealed] = useState(false)

  const identifierId = `${idPrefix}-identifier`
  const passwordId = `${idPrefix}-password`

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="auth-field">
        <label className="auth-label" htmlFor={identifierId}>
          {identifierLabel}
        </label>
        <input
          id={identifierId}
          type={identifierType}
          className="auth-input"
          placeholder={identifierPlaceholder}
          value={identifier}
          onChange={(e) => onIdentifierChange(e.target.value)}
          disabled={loading}
          // "username" covers an email address too, and is what managers look for.
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
        />
      </div>

      <div className="auth-field">
        <label className="auth-label" htmlFor={passwordId}>
          Password
        </label>

        <div className="auth-input-wrap">
          <input
            id={passwordId}
            type={revealed ? 'text' : 'password'}
            className="auth-input auth-input--with-affix"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="auth-affix-button"
            onClick={() => setRevealed((r) => !r)}
            // The label says what pressing it will do, which is what a screen
            // reader user needs; an icon alone announces nothing.
            aria-label={revealed ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <Button type="submit" className="auth-button" loading={loading}>
        {loading ? 'Signing in…' : submitLabel}
      </Button>
    </form>
  )
}

export default CredentialsForm

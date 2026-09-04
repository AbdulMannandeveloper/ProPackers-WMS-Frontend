import type { ReactNode } from 'react'

/**
 * The card both sign-in pages sit in.
 *
 * They were the same screen written twice, which is why they had drifted: the
 * staff page put its links in a row, the client page in a column, and each
 * carried a divider captioned with the title it sat directly beneath — "Client
 * sign in" above a rule reading "CLIENT SIGN IN". Shared chrome is what makes
 * the two look like one product rather than two similar screens.
 */

type Props = {
  title: string
  subtitle: string
  /** Rendered above the form. Kept as a slot so each page owns its own error state. */
  error?: string | null
  /** "Step 2 of 2" and the like; shown between the heading and the form. */
  step?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function AuthPanel({ title, subtitle, error, step, children, footer }: Props) {
  // No min-h-screen wrapper here: AuthLayout's <main> already centres inside a
  // full-height flex box. Nesting a second one made the page 940px tall in an
  // 860px viewport and scroll for nothing.
  return (
    <div className="app-auth__panel p-7 sm:p-9">
      <header className="app-auth__brand text-left">
        <div className="auth-brand-row">
          <div className="auth-brand-mark">
            <img src="/Logo.png" alt="" className="h-8 w-8 object-contain" />
          </div>
          <div className="auth-brand-name">
            <span className="auth-brand-name__title">ProPackers</span>
            <span className="auth-brand-name__sub">Warehouse Management</span>
          </div>
        </div>

        <h1 className="auth-hero-title mt-7">{title}</h1>
        <p className="auth-hero-subtitle">{subtitle}</p>
      </header>

      {step ? <div className="mt-5">{step}</div> : null}

      {error ? (
        // role="alert" so a screen reader announces a failed sign-in; without
        // it the message appears silently and the field keeps focus.
        <div className="mt-5 auth-alert auth-alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mt-6">{children}</div>

      {footer ? <div className="auth-footer">{footer}</div> : null}
    </div>
  )
}

export default AuthPanel

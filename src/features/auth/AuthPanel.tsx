import type { ReactNode } from 'react'

/**
 * The card every auth page sits in.
 *
 * The brand lives in AuthLayout above this card, so the four pages that use it
 * are identified once and identically. What is left here is the page's own
 * content: an optional role switcher, a heading, an optional step indicator,
 * an error slot, the form, and any page-specific footnote.
 */

type Props = {
  title: string
  subtitle: string
  /** The Staff/Client switcher. Omitted on the code step and on the non-choice pages. */
  tabs?: ReactNode
  /** Rendered above the form. A slot so each page owns its own error state. */
  error?: string | null
  /** "Step 2 of 2" and the like. */
  step?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function AuthPanel({ title, subtitle, tabs, error, step, children, footer }: Props) {
  return (
    <div className="app-auth__panel p-6 sm:p-8">
      {tabs ? <div className="mb-6">{tabs}</div> : null}

      <header>
        <h1 className="auth-hero-title">{title}</h1>
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

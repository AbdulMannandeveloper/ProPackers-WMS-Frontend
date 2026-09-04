import type { ReactNode } from 'react'

/**
 * One centred column: brand, card, footer.
 *
 * The dark marketing panel that used to take half the viewport is gone. It
 * pushed every form into the right-hand strip and said nothing to someone who
 * had already decided to sign in.
 *
 * The brand sits above the card rather than inside it, so all four auth pages
 * are identified once, in the same place, whatever card follows.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-stage flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6">
      {/* max-w keeps the column narrow: a centred card any wider reads as a
          slab rather than a form. */}
      <div className="w-full max-w-[27rem]">
        <header className="auth-masthead">
          <div className="auth-brand-mark">
            <img src="/Logo.png" alt="" className="h-9 w-9 object-contain" />
          </div>
          <div>
            <div className="auth-masthead__title">ProPackers</div>
            <div className="auth-masthead__sub">Warehouse Management</div>
          </div>
        </header>

        {children}

        <footer className="auth-colophon">
          <span>© {new Date().getFullYear()} ProPackers UK</span>
          <span aria-hidden="true">·</span>
          <a href="mailto:support@nayoram.com" className="auth-link auth-link--quiet">
            Support
          </a>
        </footer>
      </div>
    </main>
  )
}

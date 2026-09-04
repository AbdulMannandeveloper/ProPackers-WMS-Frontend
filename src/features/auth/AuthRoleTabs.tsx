import { NavLink } from 'react-router'

/**
 * Staff or client, as a segmented control.
 *
 * It was a text link in the card footer, which is the thing people missed.
 *
 * These are real links to the two routes, not local state. The pages are
 * genuinely different after sign-in — staff records an attendance clock-in and
 * lands on /app, a client lands on /client — and each guards its own role on
 * the verify response. Keeping them as routes means both stay bookmarkable and
 * middle-click works, while looking like a toggle.
 */

const TABS = [
  { to: '/auth/login', label: 'Staff' },
  { to: '/auth/client-login', label: 'Client' },
] as const

export function AuthRoleTabs() {
  return (
    <nav className="auth-role-tabs" aria-label="Choose who is signing in">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            `auth-role-tab ${isActive ? 'auth-role-tab--active' : 'auth-role-tab--idle'}`
          }
          // NavLink sets aria-current="page" on the active link by default,
          // which is what announces the selection.
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default AuthRoleTabs

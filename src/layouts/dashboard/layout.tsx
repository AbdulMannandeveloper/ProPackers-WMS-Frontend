import type { ReactNode } from 'react'
 
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth'

type NavItem = {
  label: string
  href: string
  tone: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/app', tone: 'bg-cyan-400' },
  { label: 'Users', href: '/app/users', tone: 'bg-indigo-400', adminOnly: true },
  { label: 'Clients', href: '/app/clients', tone: 'bg-emerald-400', adminOnly: true },
  { label: 'Services', href: '/app/services', tone: 'bg-amber-400', adminOnly: true },
  { label: 'Warehouse Locations', href: '/app/warehouse-locations', tone: 'bg-fuchsia-400', adminOnly: true },
  { label: 'Attendance', href: '/app/attendance', tone: 'bg-violet-400' },
  { label: 'Inventory', href: '/app/inventory', tone: 'bg-sky-400' },
  { label: 'Shipments', href: '/app/shipments', tone: 'bg-pink-400' },
  { label: 'Invoices & Billing', href: '/app/invoices', tone: 'bg-rose-400', adminOnly: true },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname
  const displayName = useAuthStore((s) => s.displayName) ?? 'Workspace user'
  const isClient = role === 'client'
  const isAdmin = role === 'admin'
  const visibleNavItems = navItems.filter((item) => {
    if (!item.adminOnly) return true
    return isAdmin
  })

  const isActiveRoute = (href: string) => {
    if (href === '/app') {
      return pathname === '/app' || pathname === '/app/'
    }

    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const handleSignOut = async () => {
    const currentUserId = useAuthStore.getState().userId
    if (currentUserId && (role === 'admin' || role === 'employee')) {
      try {
        const { attendance: attendanceApi } = await import('@/api')
        const logs = await attendanceApi.getAttendanceLogByField('userId', currentUserId)
        const todayStr = new Date().toISOString().split('T')[0]
        const todayLog = logs.find((l) => l.date && l.date.split('T')[0] === todayStr)
        if (todayLog && !todayLog.logoutTimestamp) {
          await attendanceApi.updateLogoutTimestamp(todayLog.id, new Date().toISOString())
        }
      } catch (err) {
        console.error('Failed to auto clock-out:', err)
      }
    }
    logout()
    navigate('/auth/login', { replace: true })
  }

  return (
    <div className="dashboard-shell min-h-screen flex">
      <aside className="dashboard-sidebar hidden md:flex w-72 flex-col border-r border-sidebar-border/80 text-sidebar-foreground">
        <div className="flex h-16 items-center justify-between gap-3 border-b border-sidebar-border/80 px-5 flex-shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="dashboard-brand-mark">
              <img src="/Logo.png" alt="ProPackers logo" className="h-8 w-8 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight text-white">ProPackers UK</div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-sidebar-foreground/55">Warehouse Platform</div>
            </div>
          </div>
        </div>

        <div className="border-b border-sidebar-border/80 px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-sidebar-foreground/45">Signed in as</div>
          <div className="mt-1 truncate text-sm font-medium text-sidebar-foreground">{displayName}</div>
          <div className="mt-3 inline-flex items-center rounded-full border border-sidebar-border/80 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/70">
            {isClient ? 'Client Portal' : 'Admin Console'}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-sidebar-foreground/35">Navigation</div>
          <div className="space-y-1">
            {visibleNavItems.map(({ label, href, tone }) => (
              <Link
                key={href}
                to={href}
                aria-current={isActiveRoute(href) ? 'page' : undefined}
                className={`dashboard-nav-item ${isActiveRoute(href) ? 'dashboard-nav-item--active' : 'dashboard-nav-item--idle'}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <div className="border-t border-sidebar-border/80 p-4">
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-200">
                <span className="grid grid-cols-2 gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-sm bg-cyan-200" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-cyan-200" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-cyan-200" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-cyan-200" />
                </span>
              </div>
              <div>
                <div className="text-sm font-medium text-white">Operational snapshot</div>
                <div className="text-xs text-sidebar-foreground/55">Clean visibility across the warehouse.</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-4 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-red-500/10 hover:text-red-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-main flex-1">
        <div className="dashboard-main__content relative z-10 p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}

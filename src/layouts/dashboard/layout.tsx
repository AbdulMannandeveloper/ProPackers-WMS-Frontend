import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth'
import { 
  LayoutDashboard, Users, Briefcase, Layers, Map, Clock, 
  Package, Truck, FileText, Banknote, CreditCard, LineChart,
  Menu, ChevronLeft, LogOut, ClipboardList
} from 'lucide-react'

type NavItem = {
  label: string
  href: string
  icon: any
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/app', icon: LayoutDashboard },
  { label: 'Users', href: '/app/users', icon: Users, adminOnly: true },
  { label: 'Clients', href: '/app/clients', icon: Briefcase, adminOnly: true },
  { label: 'Services', href: '/app/services', icon: Layers, adminOnly: true },
  { label: 'Warehouse Locations', href: '/app/warehouse-locations', icon: Map, adminOnly: true },
  { label: 'Attendance', href: '/app/attendance', icon: Clock },
  { label: 'Inventory', href: '/app/inventory', icon: Package },
  { label: 'Shipments', href: '/app/shipments', icon: Truck },
  { label: 'FDA Shipments', href: '/app/fda', icon: ClipboardList },
  { label: 'Invoices & Billing', href: '/app/invoices', icon: FileText, adminOnly: true },
  { label: 'Payroll', href: '/app/payroll', icon: Banknote },
  { label: 'Expenses', href: '/app/expenses', icon: CreditCard, adminOnly: true },
  { label: 'Profit & Loss', href: '/app/profit-loss', icon: LineChart, adminOnly: true },
]

const clientNavItems: NavItem[] = [
  { label: 'My Portal', href: '/client', icon: Briefcase },
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
  // Clients get their own portal and nothing else. The filter used to test only
  // `adminOnly`, so every non-admin item fell through to `return true` and a
  // client's sidebar showed Dashboard, Attendance, Inventory, Shipments and
  // Payroll — all of them staff routes that redirect on click. Nothing leaked,
  // but a paying customer was looking at our payroll menu, and there was no link
  // to the portal they actually have.
  const visibleNavItems = (isClient ? clientNavItems : navItems).filter((item) => {
    if (!item.adminOnly) return true
    return isAdmin
  })

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
        if (todayLog && todayLog.status !== 'leave' && todayLog.loginTimestamp && !todayLog.logoutTimestamp) {
          await attendanceApi.updateLogoutTimestamp(todayLog.id, new Date().toISOString())
        }
      } catch (err) {
        console.error('Failed to auto clock-out:', err)
      }
    }
    logout()
    navigate('/auth/login', { replace: true })
  }

  const userInitials = displayName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="dashboard-shell min-h-screen flex">
      {/* Sidebar */}
      <aside className={`dashboard-sidebar hidden md:flex flex-col border-r border-sidebar-border/80 text-sidebar-foreground transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-72'}`}>
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border/80 px-4 flex-shrink-0">
          <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}>
            <div className="dashboard-brand-mark shrink-0">
              <img src="/Logo.png" alt="ProPackers logo" className="h-8 w-8 object-contain" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 shrink-0">
                <div className="text-sm font-semibold tracking-tight text-white whitespace-nowrap">ProPackers UK</div>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button 
              onClick={() => setIsCollapsed(true)}
              className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-sidebar-foreground/70 hover:text-white transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>

        {isCollapsed && (
          <div className="flex justify-center pt-4">
            <button 
              onClick={() => setIsCollapsed(false)}
              className="p-2 rounded-lg hover:bg-white/10 text-sidebar-foreground/70 hover:text-white transition-colors"
            >
              <Menu size={20} />
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
          <div className="space-y-2">
            {visibleNavItems.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                to={href}
                title={isCollapsed ? label : undefined}
                aria-current={isActiveRoute(href) ? 'page' : undefined}
                className={`flex items-center rounded-xl transition-colors duration-200 ${
                  isCollapsed ? 'justify-center p-3' : 'gap-4 px-4 py-3'
                } ${
                  isActiveRoute(href) 
                    ? 'bg-sidebar-primary text-white shadow-md' 
                    : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={22} className="shrink-0" />
                {!isCollapsed && <span className="font-medium text-[15px] whitespace-nowrap">{label}</span>}
              </Link>
            ))}
          </div>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {/* Top Header */}
        <header className="h-16 shrink-0 flex items-center justify-between px-6 bg-transparent border-b border-transparent sticky top-0 z-40">
          <div className="flex-1"></div>
          
          {/* User Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 hover:bg-muted/80 p-1 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 font-semibold text-sm uppercase border border-indigo-500/20 shadow-sm">
                {userInitials}
              </div>
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-lg py-2 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                <div className="px-4 py-2 border-b border-border mb-1">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{isClient ? 'Client Portal' : 'Admin / Staff'}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="dashboard-main flex-1 relative overflow-y-auto">
          <div className="dashboard-main__content relative z-10 p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}

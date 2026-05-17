import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuthStore } from '@/stores/auth'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role)
  const isClient = role === 'client'

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 border-r border-border bg-white p-4">
        <div className="mb-6 text-lg font-semibold">ProPackers</div>
        <nav className="space-y-2">
          <Link to={isClient ? '/client' : '/app'} className="block px-3 py-2 rounded hover:bg-slate-100">Dashboard</Link>
          {!isClient ? <Link to="/app/users" className="block px-3 py-2 rounded hover:bg-slate-100">Users</Link> : null}
          {!isClient ? <Link to="/app/clients" className="block px-3 py-2 rounded hover:bg-slate-100">Clients</Link> : null}
          {!isClient ? <Link to="/app/services" className="block px-3 py-2 rounded hover:bg-slate-100">Services</Link> : null}
        </nav>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}

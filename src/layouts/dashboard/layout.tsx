import type { ReactNode } from 'react'
import { Link } from 'react-router'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 border-r border-border bg-white p-4">
        <div className="mb-6 text-lg font-semibold">ProPackers</div>
        <nav className="space-y-2">
          <Link to="/app" className="block px-3 py-2 rounded hover:bg-slate-100">Dashboard</Link>
          <Link to="/app/users" className="block px-3 py-2 rounded hover:bg-slate-100">Users</Link>
          <Link to="/app/clients" className="block px-3 py-2 rounded hover:bg-slate-100">Clients</Link>
          <Link to="/app/employees" className="block px-3 py-2 rounded hover:bg-slate-100">Employees</Link>
          <Link to="/app/services" className="block px-3 py-2 rounded hover:bg-slate-100">Services</Link>
        </nav>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}

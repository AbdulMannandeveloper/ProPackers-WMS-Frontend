import type { ReactNode } from 'react'

import { Navigate, useLocation } from 'react-router'

import { useAuthStore } from '@/stores/auth'
import type { AppRole } from '@/routes/types'

interface ProtectedRouteProps {
  children: ReactNode
  requireAuth: boolean
  allowedRoles?: AppRole[]
}

export function ProtectedRoute({
  children,
  requireAuth,
  allowedRoles,
}: ProtectedRouteProps) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.role)
  const authReady = useAuthStore((s) => s.authReady)
  const isAuthenticated = Boolean(token)
  const location = useLocation()

  if (!requireAuth) {
    return <>{children}</>
  }

  // The access token is held in memory, so after a reload it is briefly absent
  // while the refresh cookie is exchanged for a new one. Redirecting during that
  // window would sign out every user who pressed F5.
  if (!authReady) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-400">
        Restoring your session…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }

  if (!role) {
    return <Navigate to="/auth/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role as AppRole)) {
    return <Navigate to="/error/403" state={{ from: location }} replace />
  }


  return <>{children}</>
}

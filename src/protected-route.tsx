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
  const isAuthenticated = Boolean(token)
  const location = useLocation()

  if (!requireAuth) {
    return <>{children}</>
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


  // Role-based guard: employees only allowed to access the dashboard root
  if (role === 'employee') {
    const clean = location.pathname.replace(/\/+$/g, '')
    if (clean !== '/app') {
      return <Navigate to="/error/403" state={{ from: location }} replace />
    }
  }

  return <>{children}</>
}

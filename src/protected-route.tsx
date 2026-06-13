import type { ReactNode } from 'react'

import { Navigate, useLocation } from 'react-router'

import { defineAbilityFrom } from '@/lib/ability'
import { useAuthStore } from '@/stores/auth'
import type { AppRole } from '@/routes/types'

interface ProtectedRouteProps {
  children: ReactNode
  permissions: string[]
  requireAuth: boolean
  allowedRoles?: AppRole[]
}

export function ProtectedRoute({
  children,
  permissions,
  requireAuth,
  allowedRoles,
}: ProtectedRouteProps) {
  const { permissions: userPermissions, token } = useAuthStore()
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

  if (permissions.length > 0) {
    const ability = defineAbilityFrom(userPermissions)
    const allowed = permissions.some((p) => ability.can(p, 'all'))

    if (!allowed) {
      return <Navigate to="/error/403" state={{ from: location }} replace />
    }
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

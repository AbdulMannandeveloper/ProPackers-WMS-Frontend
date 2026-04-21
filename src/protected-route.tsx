import type { ReactNode } from 'react'

import { Navigate, useLocation } from 'react-router'

import { defineAbilityFrom } from '@/lib/ability'
import { useAuthStore } from '@/stores/auth'

interface ProtectedRouteProps {
  children: ReactNode
  permissions: string[]
  requireAuth: boolean
}

export function ProtectedRoute({
  children,
  permissions,
  requireAuth,
}: ProtectedRouteProps) {
  const { permissions: userPermissions, token } = useAuthStore()
  const isAuthenticated = Boolean(token)
  const location = useLocation()

  if (!requireAuth) {
    return <>{children}</>
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }

  if (permissions.length > 0) {
    const ability = defineAbilityFrom(userPermissions)
    const allowed = permissions.some((p) => ability.can(p, 'all'))

    if (!allowed) {
      return <Navigate to="/error/403" state={{ from: location }} replace />
    }
  }

  return <>{children}</>
}

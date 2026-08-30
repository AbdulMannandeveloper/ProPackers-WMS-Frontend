import type { ComponentType, ReactNode } from 'react'

export type AppRole = 'admin' | 'employee' | 'client'

export interface RouteDefinition {
  path: string
  element: ComponentType
  requireAuth: boolean
  allowedRoles?: AppRole[]
  title?: string
  icon?: ComponentType<{ className?: string }>
  hidden?: boolean
}

export interface RouteGroup {
  name: string
  basePath: string
  layout?: ComponentType<{ children: ReactNode }>
  routes: RouteDefinition[]
}

export interface MenuItemWithPermissions {
  title: string
  url: string
  icon: ComponentType<{ className?: string }>
}

import type { ComponentType, ReactNode } from 'react'

export interface RouteDefinition {
  path: string
  element: ComponentType
  permissions: string[]
  requireAuth: boolean
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
  permissions?: string[]
}

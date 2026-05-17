import DashboardLayout from '@/layouts/dashboard/layout'
import ClientPortalPage from '@/pages/client/index'
import type { RouteGroup } from '@/routes/types'

export const clientRoutes: RouteGroup = {
  name: 'client',
  basePath: '/client',
  layout: DashboardLayout,
  routes: [
    {
      path: '/',
      element: ClientPortalPage,
      title: 'Client Portal',
      permissions: [],
      requireAuth: true,
    },
  ],
}

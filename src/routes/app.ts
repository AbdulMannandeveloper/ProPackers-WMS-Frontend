import DashboardLayout from '@/layouts/dashboard/layout'
import DashboardIndex from '@/pages/dashboard/index'
import UsersPage from '@/pages/users/index'
import ClientsPage from '@/pages/clients/index'
import ServicesPage from '@/pages/services/index'
import type { RouteGroup } from '@/routes/types'

export const appRoutes: RouteGroup = {
  name: 'app',
  basePath: '/app',
  layout: DashboardLayout,
  routes: [
    { path: '/', element: DashboardIndex, title: 'Dashboard', permissions: [], requireAuth: true },
    { path: '/users', element: UsersPage, title: 'Users', permissions: [], requireAuth: true },
    { path: '/clients', element: ClientsPage, title: 'Clients', permissions: [], requireAuth: true },
    { path: '/services', element: ServicesPage, title: 'Services', permissions: [], requireAuth: true },
  ],
}

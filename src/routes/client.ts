import DashboardLayout from '@/layouts/dashboard/layout'
import ClientPortalPage from '@/pages/client/index'
import type { RouteDefinition, RouteGroup } from '@/routes/types'

/**
 * The portal's sections are real routes rather than in-page tabs.
 *
 * They render one component, which reads the section out of the URL. Doing it
 * this way means the sidebar drives them like every other part of the app, the
 * browser's back button works, and a client can bookmark their invoices instead
 * of landing on the overview and clicking across every time.
 */
const section = (path: string, title: string): RouteDefinition => ({
  path,
  element: ClientPortalPage,
  title,
  requireAuth: true,
  allowedRoles: ['client'],
})

export const clientRoutes: RouteGroup = {
  name: 'client',
  basePath: '/client',
  layout: DashboardLayout,
  routes: [
    section('/', 'Overview'),
    section('/inventory', 'My Inventory'),
    section('/shipments', 'Shipments'),
    section('/billing', 'Billing & Invoices'),
    section('/services', 'Services'),
    section('/profile', 'Profile'),
  ],
}

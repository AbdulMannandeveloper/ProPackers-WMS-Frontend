import DashboardLayout from '@/layouts/dashboard/layout'
import DashboardIndex from '@/pages/dashboard/index'
import UsersPage from '@/pages/users/index'
import ClientsPage from '@/pages/clients/index'
import ServicesPage from '@/pages/services/index'
import WarehouseLocationsPage from '@/pages/warehouse-locations/index'
import AttendancePage from '@/pages/attendance/index'
import InventoryPage from '@/pages/inventory/index'
import ShipmentsPage from '@/pages/shipments/index'
import InvoicesPage from '@/pages/invoices/index'
import PayrollPage from '@/pages/payroll/index'
import ExpensesPage from '@/pages/expenses/index'
import PLPage from '@/pages/profit-loss/index'
import type { RouteGroup } from '@/routes/types'

export const appRoutes: RouteGroup = {
  name: 'app',
  basePath: '/app',
  layout: DashboardLayout,
  routes: [
    { path: '/', element: DashboardIndex, title: 'Dashboard', permissions: [], requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/users', element: UsersPage, title: 'Users', permissions: [], requireAuth: true, allowedRoles: ['admin'] },
    { path: '/clients', element: ClientsPage, title: 'Clients', permissions: [], requireAuth: true, allowedRoles: ['admin'] },
    { path: '/services', element: ServicesPage, title: 'Services', permissions: [], requireAuth: true, allowedRoles: ['admin'] },
    { path: '/warehouse-locations', element: WarehouseLocationsPage, title: 'Warehouse Locations', permissions: [], requireAuth: true, allowedRoles: ['admin'] },
    { path: '/attendance', element: AttendancePage, title: 'Attendance', permissions: [], requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/inventory', element: InventoryPage, title: 'Inventory', permissions: [], requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/shipments', element: ShipmentsPage, title: 'Shipments', permissions: [], requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/invoices', element: InvoicesPage, title: 'Invoices & Billing', permissions: [], requireAuth: true, allowedRoles: ['admin'] },
    { path: '/payroll', element: PayrollPage, title: 'Payroll', permissions: [], requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/expenses', element: ExpensesPage, title: 'Expenses', permissions: [], requireAuth: true, allowedRoles: ['admin'] },
    { path: '/profit-loss', element: PLPage, title: 'Profit & Loss', permissions: [], requireAuth: true, allowedRoles: ['admin'] },
  ],
}

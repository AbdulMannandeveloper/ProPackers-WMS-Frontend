import DashboardLayout from '@/layouts/dashboard/layout'
import DashboardIndex from '@/pages/dashboard/index'
import UsersPage from '@/pages/users/index'
import ClientsPage from '@/pages/clients/index'
import EmployeesPage from '@/pages/employees/index'
import ServicesPage from '@/pages/services/index'
import WarehouseLocationsPage from '@/pages/warehouse-locations/index'
import AttendancePage from '@/pages/attendance/index'
import InventoryPage from '@/pages/inventory/index'
import ShipmentsPage from '@/pages/shipments/index'
import FdaPage from '@/pages/fda/index'
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
    { path: '/', element: DashboardIndex, title: 'Dashboard', requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/users', element: UsersPage, title: 'Users', requireAuth: true, allowedRoles: ['admin'] },
    { path: '/clients', element: ClientsPage, title: 'Clients', requireAuth: true, allowedRoles: ['admin'] },
    { path: '/employees', element: EmployeesPage, title: 'Employees', requireAuth: true, allowedRoles: ['admin'] },
    { path: '/services', element: ServicesPage, title: 'Services', requireAuth: true, allowedRoles: ['admin'] },
    { path: '/warehouse-locations', element: WarehouseLocationsPage, title: 'Warehouse Locations', requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/attendance', element: AttendancePage, title: 'Attendance', requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/inventory', element: InventoryPage, title: 'Inventory', requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/shipments', element: ShipmentsPage, title: 'Shipments', requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/fda', element: FdaPage, title: 'FDA Shipments', requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/invoices', element: InvoicesPage, title: 'Invoices & Billing', requireAuth: true, allowedRoles: ['admin'] },
    { path: '/payroll', element: PayrollPage, title: 'Payroll', requireAuth: true, allowedRoles: ['admin', 'employee'] },
    { path: '/expenses', element: ExpensesPage, title: 'Expenses', requireAuth: true, allowedRoles: ['admin'] },
    { path: '/profit-loss', element: PLPage, title: 'Profit & Loss', requireAuth: true, allowedRoles: ['admin'] },
  ],
}

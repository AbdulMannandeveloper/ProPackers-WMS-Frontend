import AuthLayout from '@/layouts/auth/layout'
import AdminSignupPage from '@/pages/auth/admin-signup'
import ClientLoginPage from '@/pages/auth/client-login'
import LoginPage from '@/pages/auth/login'
import type { RouteGroup } from '@/routes/types'

export const authRoutes: RouteGroup = {
  name: 'auth',
  basePath: '/auth',
  layout: AuthLayout,
  routes: [
    {
      path: '/login',
      element: LoginPage,
      title: 'Login',
      requireAuth: false,
    },
    {
      path: '/client-login',
      element: ClientLoginPage,
      title: 'Client Login',
      requireAuth: false,
    },
    {
      path: '/admin-signup',
      element: AdminSignupPage,
      title: 'Admin Signup',
      requireAuth: false,
    },
  ],
}

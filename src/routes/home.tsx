import { HomeLayout } from '@/layouts/home/layout'
import type { RouteGroup } from '@/routes/types'
import { Navigate } from 'react-router'

const RedirectToLogin = () => <Navigate to="/auth/login" replace />

export const homeRoutes: RouteGroup = {
  name: 'home',
  basePath: '/',
  layout: HomeLayout,
  routes: [
    {
      path: '',
      element: RedirectToLogin,
      title: 'Home',
      permissions: [],
      requireAuth: false,
    },
  ],
}

export default homeRoutes

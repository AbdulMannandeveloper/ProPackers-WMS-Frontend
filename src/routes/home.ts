import { HomeLayout } from '@/layouts/home/layout'
import HomeIndex from '@/pages/home/index'
import type { RouteGroup } from '@/routes/types'

export const homeRoutes: RouteGroup = {
  name: 'home',
  basePath: '/',
  layout: HomeLayout,
  routes: [
    {
      path: '/',
      element: HomeIndex,
      title: 'Home',
      permissions: [],
      requireAuth: false,
    },
  ],
}

import { Fragment } from 'react'

import { BrowserRouter, Route, Routes } from 'react-router'

import { ProtectedRoute } from '@/protected-route'
import AuthLayout from '@/layouts/auth/layout'
import { homeRoutes } from '@/routes/home.tsx'
import { authRoutes } from '@/routes/auth'
import { appRoutes } from '@/routes/app'
import { clientRoutes } from '@/routes/client'
import SetupPasswordPage from '@/pages/auth/setup-password'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/setup-password"
          element={<AuthLayout><SetupPasswordPage /></AuthLayout>}
        />

        {/* auth routes */}
        {authRoutes.routes.map((route) => {
          const Layout = authRoutes.layout ?? Fragment
          const RouteComponent = route.element

          return (
            <Route
              key={`auth-${route.path}`}
              path={`${authRoutes.basePath}${route.path}`}
              element={
                <ProtectedRoute
                  permissions={route.permissions}
                  requireAuth={route.requireAuth}
                >
                  <Layout>
                    <RouteComponent />
                  </Layout>
                </ProtectedRoute>
              }
            />
          )
        })}

        {/* app (dashboard) routes */}
        {appRoutes.routes.map((route) => {
          const Layout = appRoutes.layout ?? Fragment
          const RouteComponent = route.element

          return (
            <Route
              key={`app-${route.path}`}
              path={`${appRoutes.basePath}${route.path}`}
              element={
                <ProtectedRoute
                  permissions={route.permissions}
                  requireAuth={route.requireAuth}
                >
                  <Layout>
                    <RouteComponent />
                  </Layout>
                </ProtectedRoute>
              }
            />
          )
        })}

        {/* client portal routes */}
        {clientRoutes.routes.map((route) => {
          const Layout = clientRoutes.layout ?? Fragment
          const RouteComponent = route.element

          return (
            <Route
              key={`client-${route.path}`}
              path={`${clientRoutes.basePath}${route.path}`}
              element={
                <ProtectedRoute
                  permissions={route.permissions}
                  requireAuth={route.requireAuth}
                >
                  <Layout>
                    <RouteComponent />
                  </Layout>
                </ProtectedRoute>
              }
            />
          )
        })}

        {/* home routes */}
        {homeRoutes.routes.map((route) => {
          const Layout = homeRoutes.layout ?? Fragment
          const RouteComponent = route.element

          return (
            <Route
              key={`home-${route.path}`}
              path={`${homeRoutes.basePath}${route.path}`}
              element={
                <ProtectedRoute
                  permissions={route.permissions}
                  requireAuth={route.requireAuth}
                >
                  <Layout>
                    <RouteComponent />
                  </Layout>
                </ProtectedRoute>
              }
            />
          )
        })}

        {/* More routes go here like auth routes, error routes, etc. */}
      </Routes>
    </BrowserRouter>
  )
}

export default App

import { Fragment } from 'react'

import { BrowserRouter, Route, Routes } from 'react-router'

import { ProtectedRoute } from '@/protected-route'
import { ErrorBoundary } from '@/error-boundary'
import AuthLayout from '@/layouts/auth/layout'
import { homeRoutes } from '@/routes/home.tsx'
import { authRoutes } from '@/routes/auth'
import { appRoutes } from '@/routes/app'
import { clientRoutes } from '@/routes/client'
import AdminSignupPage from '@/pages/auth/admin-signup'
import SetupPasswordPage from '@/pages/auth/setup-password'
import Error403 from '@/pages/error/403'
import NotFound404 from '@/pages/error/404'

function App() {
  const AppLayout = appRoutes.layout ?? Fragment
  const ClientLayout = clientRoutes.layout ?? Fragment

  return (
    <ErrorBoundary>
      <BrowserRouter>
      <Routes>
        <Route
          path="/admin-signup"
          element={<AuthLayout><AdminSignupPage /></AuthLayout>}
        />

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
                  requireAuth={route.requireAuth}
                  allowedRoles={route.allowedRoles}
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
                  requireAuth={route.requireAuth}
                  allowedRoles={route.allowedRoles}
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
                  requireAuth={route.requireAuth}
                  allowedRoles={route.allowedRoles}
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
                  requireAuth={route.requireAuth}
                  allowedRoles={route.allowedRoles}
                >
                  <Layout>
                    <RouteComponent />
                  </Layout>
                </ProtectedRoute>
              }
            />
          )
        })}

        <Route
          path="/app/*"
          element={
            <ProtectedRoute requireAuth allowedRoles={['admin', 'employee']}>
              <AppLayout>
                <NotFound404 />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/client/*"
          element={
            <ProtectedRoute requireAuth allowedRoles={['client']}>
              <ClientLayout>
                <NotFound404 />
              </ClientLayout>
            </ProtectedRoute>
          }
        />

        {/* error routes */}
        <Route path="/error/403" element={<Error403 />} />

        {/* catch-all 404 */}
        <Route path="*" element={<NotFound404 />} />
        {/* More routes go here like auth routes, error routes, etc. */}
      </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App

import { Fragment, useEffect } from 'react'

import { BrowserRouter, Route, Routes } from 'react-router'

import { ProtectedRoute } from '@/protected-route'
import { restoreSession } from '@/api/http-client'
import { useAuthStore } from '@/stores/auth'
import { ErrorBoundary } from '@/error-boundary'
import { TitledRoute } from '@/components/TitledRoute'
import { TopProgressBar } from '@/components/TopProgressBar'
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
  const setAuthReady = useAuthStore((s) => s.setAuthReady)

  // One attempt at the refresh cookie on boot. It either yields a fresh access
  // token into memory or it does not, and either way the routes may then decide.
  useEffect(() => {
    let cancelled = false
    restoreSession().finally(() => {
      if (!cancelled) setAuthReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [setAuthReady])

  const AppLayout = appRoutes.layout ?? Fragment
  const ClientLayout = clientRoutes.layout ?? Fragment

  return (
    <ErrorBoundary>
      <BrowserRouter>
      <TopProgressBar />
      <Routes>
        <Route
          path="/admin-signup"
          element={
            <AuthLayout>
              <TitledRoute title="Admin Signup">
                <AdminSignupPage />
              </TitledRoute>
            </AuthLayout>
          }
        />

        <Route
          path="/setup-password"
          element={
            <AuthLayout>
              <TitledRoute title="Set Your Password">
                <SetupPasswordPage />
              </TitledRoute>
            </AuthLayout>
          }
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
                    <TitledRoute title={route.title}>
                      <RouteComponent />
                    </TitledRoute>
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
                    <TitledRoute title={route.title}>
                      <RouteComponent />
                    </TitledRoute>
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
                    <TitledRoute title={route.title}>
                      <RouteComponent />
                    </TitledRoute>
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
                    <TitledRoute title={route.title}>
                      <RouteComponent />
                    </TitledRoute>
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

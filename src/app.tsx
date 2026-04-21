import { Fragment } from 'react'

import { BrowserRouter, Route, Routes } from 'react-router'

import { ProtectedRoute } from '@/protected-route'
import { homeRoutes } from '@/routes/home'

function App() {
  return (
    <BrowserRouter>
      <Routes>
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

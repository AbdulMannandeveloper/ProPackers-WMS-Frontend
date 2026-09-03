import { useEffect } from 'react'
import { useLocation } from 'react-router'

import { resolveTitle } from '@/lib/title'

/**
 * Keeps document.title in step with the route.
 *
 * Written as a hook used by one wrapper component rather than called from each
 * page: app.tsx already maps every route group through the same three loops, so
 * wrapping there covers all twenty-odd routes and no page has to remember.
 */
export const useDocumentTitle = (title?: string) => {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = resolveTitle(title, pathname)
  }, [title, pathname])
}

export default useDocumentTitle

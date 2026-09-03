import type { ReactNode } from 'react'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/**
 * Sets the browser tab title for whatever it wraps.
 *
 * Every route group in app.tsx renders `<Layout><RouteComponent /></Layout>`,
 * so slipping this in there names all twenty-odd routes from the `title` each
 * one already declares — no page has to remember to do it.
 */
export function TitledRoute({ title, children }: { title?: string; children: ReactNode }) {
  useDocumentTitle(title)
  return <>{children}</>
}

export default TitledRoute

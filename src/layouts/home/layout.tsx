import type { ReactNode } from 'react'

import { HomeFooter } from '@/layouts/home/footer'
import { HomeHeader } from '@/layouts/home/header'

export function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 flex flex-col min-h-screen">
      <HomeHeader />
      <main className="flex-grow">{children}</main>
      <HomeFooter />
    </div>
  )
}

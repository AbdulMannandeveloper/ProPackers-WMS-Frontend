import type { ReactNode } from 'react'

import { defineAbilityFrom } from '@/lib/ability'
import { useAuthStore } from '@/stores/auth'

type CanProps = {
  I: string | string[]
  children: ReactNode
}

export function Can({ I, children }: CanProps) {
  const { permissions } = useAuthStore()
  const ability = defineAbilityFrom(permissions)
  const actions = Array.isArray(I) ? I : [I]
  const allowed = actions.some((action) => ability.can(action, 'all'))

  return allowed ? children : null
}

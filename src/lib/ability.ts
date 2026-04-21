import { createContext } from 'react'

import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from '@casl/ability'

export type AppAbility = MongoAbility<[string, 'all']>

export const AbilityContext = createContext<AppAbility>(createMongoAbility())

export function defineAbilityFrom(permissions: string[] = []): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  for (const perm of permissions) {
    can(perm, 'all')
  }

  return build()
}

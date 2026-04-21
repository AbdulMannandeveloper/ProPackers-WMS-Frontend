import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  permissions: string[]
  token: string | null
  setPermissions: (permissions: string[]) => void
  setToken: (token: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      permissions: [],
      token: null,
      setPermissions: (permissions: string[]) => set({ permissions }),
      setToken: (token: string | null) => set({ token }),
    }),
    { name: 'auth-store' },
  ),
)

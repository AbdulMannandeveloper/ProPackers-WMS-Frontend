import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  permissions: string[]
  token: string | null
  userId?: string | null
  role?: string | null
  setPermissions: (permissions: string[]) => void
  setToken: (token: string | null) => void
  setUserId: (id: string | null) => void
  setRole: (role: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      permissions: [],
      token: null,
      userId: null,
      role: null,
      setPermissions: (permissions: string[]) => set({ permissions }),
      setToken: (token: string | null) => set({ token }),
      setUserId: (id: string | null) => set({ userId: id }),
      setRole: (role: string | null) => set({ role }),
    }),
    { name: 'auth-store' },
  ),
)

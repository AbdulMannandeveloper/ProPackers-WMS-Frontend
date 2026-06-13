import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  permissions: string[]
  token: string | null
  userId?: string | null
  role?: string | null
  displayName?: string | null
  logout: () => void
  setPermissions: (permissions: string[]) => void
  setToken: (token: string | null) => void
  setUserId: (id: string | null) => void
  setRole: (role: string | null) => void
  setDisplayName: (displayName: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      permissions: [],
      token: null,
      userId: null,
      role: null,
      logout: () =>
        set({
          permissions: [],
          token: null,
          userId: null,
          role: null,
          displayName: null,
        }),
      setPermissions: (permissions: string[]) => set({ permissions }),
      setToken: (token: string | null) => set({ token }),
      setUserId: (id: string | null) => set({ userId: id }),
      setRole: (role: string | null) => set({ role }),
      setDisplayName: (displayName: string | null) => set({ displayName }),
    }),
    { name: 'auth-store' },
  ),
)

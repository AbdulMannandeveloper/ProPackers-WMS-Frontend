import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AXIOS_INSTANCE } from '@/api/http-client'

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
    (set, get) => ({
      permissions: [],
      token: null,
      userId: null,
      role: null,
      logout: () => {
        // Auto-update attendance logout timestamp before clearing auth (US-064)
        const userId = get().userId
        if (userId) {
          const todayStr = new Date().toISOString().split('T')[0]
          AXIOS_INSTANCE.get(`/api/attendance/userId/${userId}`)
            .then((res) => {
              const logs = Array.isArray(res.data) ? res.data : []
              const todayLog = logs.find(
                (l: any) => l.date && l.date.split('T')[0] === todayStr
              )
              if (todayLog) {
                AXIOS_INSTANCE.put(`/api/attendance/${todayLog.id}/logout`, {
                  logoutTimestamp: new Date().toISOString(),
                }).catch(() => {})
              }
            })
            .catch(() => {})
        }

        set({
          permissions: [],
          token: null,
          userId: null,
          role: null,
          displayName: null,
        })
      },
      setPermissions: (permissions: string[]) => set({ permissions }),
      setToken: (token: string | null) => set({ token }),
      setUserId: (id: string | null) => set({ userId: id }),
      setRole: (role: string | null) => set({ role }),
      setDisplayName: (displayName: string | null) => set({ displayName }),
    }),
    { name: 'auth-store' },
  ),
)

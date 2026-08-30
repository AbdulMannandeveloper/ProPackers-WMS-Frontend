import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AXIOS_INSTANCE } from '@/api/http-client'

interface AuthState {
  /**
   * False until the boot-time refresh has resolved. The access token is no
   * longer persisted, so on a reload there is briefly no token even for a
   * perfectly good session — without this, every refresh would bounce the user
   * to the login screen.
   */
  authReady: boolean
  setAuthReady: (ready: boolean) => void
  token: string | null
  userId?: string | null
  role?: string | null
  displayName?: string | null
  logout: () => void
  setToken: (token: string | null) => void
  setUserId: (id: string | null) => void
  setRole: (role: string | null) => void
  setDisplayName: (displayName: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      authReady: false,
      setAuthReady: (authReady: boolean) => set({ authReady }),
      token: null,
      userId: null,
      role: null,
      logout: () => {
        // Auto-update the attendance logout timestamp before clearing (US-064).
        const userId = get().userId
        if (userId) {
          const todayStr = new Date().toISOString().split('T')[0]
          AXIOS_INSTANCE.get(`/api/attendance/userId/${userId}`)
            .then((res) => {
              const logs = Array.isArray(res.data) ? res.data : []
              const todayLog = logs.find(
                (l: any) => l.date && l.date.split('T')[0] === todayStr
              )
              if (todayLog && todayLog.status !== 'leave' && todayLog.loginTimestamp) {
                AXIOS_INSTANCE.put(`/api/attendance/${todayLog.id}/logout`, {
                  logoutTimestamp: new Date().toISOString(),
                }).catch(() => {})
              }
            })
            .catch(() => {})
        }

        // Tell the server, so the httpOnly refresh cookie is cleared. Clearing
        // local state alone would leave a working cookie behind — which is how
        // logout used to be purely cosmetic.
        AXIOS_INSTANCE.post('/api/auth/logout').catch(() => {})

        set({
          token: null,
          userId: null,
          role: null,
          displayName: null,
        })
      },
      setToken: (token: string | null) => set({ token }),
      setUserId: (id: string | null) => set({ userId: id }),
      setRole: (role: string | null) => set({ role }),
      setDisplayName: (displayName: string | null) => set({ displayName }),
    }),
    {
      name: 'auth-store',
      /**
       * The access token is deliberately NOT persisted. It lived in
       * localStorage before, where any XSS could read it and where it survived
       * for its full twelve hours.
       *
       * What survives a reload now is the httpOnly refresh cookie, which
       * JavaScript cannot reach: on boot the app calls /api/auth/refresh and
       * gets a fresh short-lived token into memory. Identity is persisted so
       * the shell can render before that round-trip finishes.
       */
      partialize: (state) => ({
        userId: state.userId,
        role: state.role,
        displayName: state.displayName,
      }),
    },
  ),
)

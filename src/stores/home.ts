import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface HomeState {
  count: number
  increment: () => void
  decrement: () => void
  clear: () => void
}

export const useHomeStore = create<HomeState>()(
  persist(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
      decrement: () => set((state) => ({ count: state.count - 1 })),
      clear: () => set({ count: 0 }),
    }),
    { name: 'home-store' },
  ),
)

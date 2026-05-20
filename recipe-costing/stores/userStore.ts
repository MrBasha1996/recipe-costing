import { create } from 'zustand'
import type { UserProfile, Role } from '@/types'

interface UserStore {
  profile: UserProfile | null
  setProfile: (p: UserProfile | null) => void
  role: Role | null
  canSeePrices: () => boolean
  canEdit: () => boolean
  isAccountant: () => boolean
}

export const useUserStore = create<UserStore>()((set, get) => ({
  profile: null,
  role: null,
  setProfile: (profile) => set({ profile, role: profile?.role ?? null }),
  canSeePrices: () => get().role === 'accountant',
  canEdit: () => get().role !== 'kitchen',
  isAccountant: () => get().role === 'accountant',
}))

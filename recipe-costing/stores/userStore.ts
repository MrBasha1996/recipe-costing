import { create } from 'zustand'
import type { UserProfile, Role } from '@/types'

interface UserStore {
  profile: UserProfile | null
  setProfile: (p: UserProfile | null) => void
  role: Role | null
  canSeePrices: () => boolean
  canEdit: () => boolean
  isAccountant: () => boolean
  isManagement: () => boolean
}

export const useUserStore = create<UserStore>()((set, get) => ({
  profile: null,
  role: null,
  setProfile: (profile) => set({ profile, role: profile?.role ?? null }),
  canSeePrices: () => get().role === 'accountant' || get().role === 'management',
  canEdit: () => get().role !== 'kitchen' && get().role !== 'management',
  isAccountant: () => get().role === 'accountant',
  isManagement: () => get().role === 'management',
}))

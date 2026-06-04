import { create } from 'zustand'
import type { UserProfile } from '@/types'
import { usePermissionsStore } from '@/stores/permissionsStore'

interface UserStore {
  profile: UserProfile | null
  setProfile: (p: UserProfile | null) => void
  canSeePrices: () => boolean
  canEdit: (module?: string) => boolean
  isAccountant: () => boolean
  isManagement: () => boolean
}

export const useUserStore = create<UserStore>()((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  canSeePrices: () => {
    const { isSuperAdmin, hasPermission } = usePermissionsStore.getState()
    return isSuperAdmin || hasPermission('costs', 'view')
  },
  canEdit: (module = 'costing') => {
    const { isSuperAdmin, hasPermission } = usePermissionsStore.getState()
    return isSuperAdmin || hasPermission(module, 'update')
  },
  isAccountant: () => usePermissionsStore.getState().isSuperAdmin,
  isManagement: () => {
    const { isSuperAdmin, hasPermission } = usePermissionsStore.getState()
    return !isSuperAdmin && hasPermission('reports', 'view')
  },
}))

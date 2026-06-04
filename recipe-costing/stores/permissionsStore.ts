import { create } from 'zustand'
import type { PermissionsMap, PermissionAction } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'

interface PermissionsStore {
  permissions: PermissionsMap
  isSuperAdmin: boolean
  roleName: string | null
  loaded: boolean
  loadPermissions: (userId: string, supabase: SupabaseClient) => Promise<void>
  hasPermission: (module: string, action: PermissionAction) => boolean
  reset: () => void
}

export const usePermissionsStore = create<PermissionsStore>((set, get) => ({
  permissions: {},
  isSuperAdmin: false,
  roleName: null,
  loaded: false,

  loadPermissions: async (userId: string, supabase: SupabaseClient) => {
    try {
      // Get user's role_id
      const { data: profile } = await (supabase.from('user_profiles') as any)
        .select('role_id, roles(is_super_admin, name)')
        .eq('id', userId)
        .single()

      if (!profile?.role_id) {
        set({ permissions: {}, isSuperAdmin: false, roleName: null, loaded: true })
        return
      }

      const isSuperAdmin = (profile.roles as any)?.is_super_admin === true
      const roleName: string | null = (profile.roles as any)?.name ?? null

      if (isSuperAdmin) {
        set({ permissions: {}, isSuperAdmin: true, roleName, loaded: true })
        return
      }

      // Fetch role permissions with module codes
      const { data: rp } = await (supabase.from('role_permissions') as any)
        .select('can_view, can_create, can_update, can_delete, modules(code)')
        .eq('role_id', profile.role_id)

      const map: PermissionsMap = {}
      for (const row of (rp || []) as any[]) {
        const code = (row.modules as any)?.code
        if (code) {
          map[code] = {
            can_view:   row.can_view,
            can_create: row.can_create,
            can_update: row.can_update,
            can_delete: row.can_delete,
          }
        }
      }

      set({ permissions: map, isSuperAdmin: false, roleName, loaded: true })

      // Realtime: reload if user's role_id changes
      ;(supabase.channel(`user_profile_${userId}`) as any)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${userId}`,
        }, () => {
          get().loadPermissions(userId, supabase)
        })
        .subscribe()
    } catch {
      set({ permissions: {}, isSuperAdmin: false, loaded: true })
    }
  },

  hasPermission: (module: string, action: PermissionAction): boolean => {
    const { isSuperAdmin, permissions } = get()
    if (isSuperAdmin) return true
    const p = permissions[module]
    if (!p) return false
    switch (action) {
      case 'view':   return p.can_view
      case 'create': return p.can_create
      case 'update': return p.can_update
      case 'delete': return p.can_delete
    }
  },

  reset: () => set({ permissions: {}, isSuperAdmin: false, roleName: null, loaded: false }),
}))

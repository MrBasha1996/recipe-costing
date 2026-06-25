import { usePermissionsStore } from '@/stores/permissionsStore'
import type { PermissionAction } from '@/types'

export function usePermissions() {
  const { hasPermission, isSuperAdmin, loaded, permissions } = usePermissionsStore()
  return { hasPermission, isSuperAdmin, loaded, permissions }
}

/** Shorthand for a single permission check */
export function useHasPermission(module: string, action: PermissionAction): boolean {
  const { hasPermission } = usePermissionsStore()
  return hasPermission(module, action)
}

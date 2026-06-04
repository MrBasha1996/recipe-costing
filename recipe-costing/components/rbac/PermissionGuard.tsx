'use client'

import { usePermissions } from '@/hooks/usePermissions'
import type { PermissionAction } from '@/types'

interface Props {
  module: string
  action: PermissionAction
  children: React.ReactNode
  /** Shown instead of children when permission is denied. Default: null (hidden). */
  fallback?: React.ReactNode
}

/**
 * Renders children only when the current user has the required permission.
 * Usage: <PermissionGuard module="roles" action="create">...</PermissionGuard>
 */
export default function PermissionGuard({ module, action, children, fallback = null }: Props) {
  const { hasPermission, loaded } = usePermissions()
  if (!loaded) return null
  if (!hasPermission(module, action)) return <>{fallback}</>
  return <>{children}</>
}

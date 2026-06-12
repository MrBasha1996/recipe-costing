import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type AuthUser = { id: string; email?: string }

/** Returns the authenticated user or a 401 NextResponse. */
export async function requireUser(): Promise<AuthUser | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  return user as AuthUser
}

/**
 * Returns the authenticated user after verifying they have access to brandId.
 * Blocks any user whose brand_access doesn't cover the requested brand.
 * Use this in every API route that writes data with service_role (admin client).
 */
export async function requireBrandAccess(brandId: string): Promise<AuthUser | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('brand_access')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.brand_access !== 'all' && profile.brand_access !== brandId)) {
    return NextResponse.json({ error: 'ليس لديك صلاحية لهذا البراند' }, { status: 403 })
  }
  return user as AuthUser
}

/**
 * Returns the authenticated super-admin user or a 403 NextResponse.
 * Super-admin is determined by roles.is_super_admin = true on the user's role.
 */
export async function requireSuperAdmin(): Promise<AuthUser | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('role_id, roles(is_super_admin)')
    .eq('id', user.id)
    .single()

  if (!(profile?.roles as any)?.is_super_admin) {
    return NextResponse.json({ error: 'يتطلب صلاحيات المشرف العام' }, { status: 403 })
  }

  return user as AuthUser
}

/**
 * Verifies brand access AND module permission in one call.
 * Super admins bypass the module check.
 * Use in every API route that writes data with service_role (admin client).
 */
export async function requireModulePermission(
  brandId: string,
  moduleCode: string,
  action: 'view' | 'create' | 'update' | 'delete' | 'approve' | 'import' | 'export',
): Promise<AuthUser | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('role_id, brand_access, roles(is_super_admin)')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.brand_access !== 'all' && profile.brand_access !== brandId)) {
    return NextResponse.json({ error: 'ليس لديك صلاحية لهذا البراند' }, { status: 403 })
  }

  if ((profile.roles as any)?.is_super_admin) return user as AuthUser

  if (!profile.role_id) {
    return NextResponse.json({ error: 'لا يوجد دور مُعيَّن' }, { status: 403 })
  }

  const { data: perms } = await (supabase.from('role_permissions') as any)
    .select(`can_view, can_create, can_update, can_delete, can_approve, can_import, can_export,
             modules!inner(code)`)
    .eq('role_id', profile.role_id)

  const perm = (perms as any[])?.find((p: any) => p.modules?.code === moduleCode)

  const actionMap: Record<string, string> = {
    view: 'can_view', create: 'can_create', update: 'can_update',
    delete: 'can_delete', approve: 'can_approve', import: 'can_import', export: 'can_export',
  }
  if (!perm?.[actionMap[action]]) {
    return NextResponse.json({ error: 'ليس لديك صلاحية لهذا الإجراء' }, { status: 403 })
  }

  return user as AuthUser
}

/** Type guard: distinguishes a successful user from an error response. */
export function isAuthError(v: AuthUser | NextResponse): v is NextResponse {
  return v instanceof NextResponse
}

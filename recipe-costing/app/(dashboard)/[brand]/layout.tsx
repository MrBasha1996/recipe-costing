import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getValidBrands } from '@/lib/server-brand'
import DashboardShell from './DashboardShell'
import type { BrandId, PermissionsMap } from '@/types'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ brand: string }>
}) {
  const { brand: brandParam } = await params

  const validBrands = await getValidBrands()
  if (!validBrands.includes(brandParam)) {
    redirect(`/${validBrands[0] ?? 'costing'}/costing`)
  }

  const brand = brandParam as BrandId

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('*, roles(is_super_admin, name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const isSuperAdmin = (profile.roles as any)?.is_super_admin === true
  const roleName: string | null = (profile.roles as any)?.name ?? null
  let initialPermissions: PermissionsMap = {}

  if (!isSuperAdmin && profile.role_id) {
    const { data: rp } = await (supabase as any)
      .from('role_permissions')
      .select('can_view, can_create, can_update, can_delete, can_approve, can_import, can_edit_price, can_post, can_print, can_export, modules!inner(code)')
      .eq('role_id', profile.role_id)
    for (const row of (rp || []) as any[]) {
      const code = (row.modules as any)?.code
      if (code) {
        initialPermissions[code] = {
          can_view:       row.can_view,
          can_create:     row.can_create,
          can_update:     row.can_update,
          can_delete:     row.can_delete,
          can_approve:    row.can_approve    ?? false,
          can_import:     row.can_import     ?? false,
          can_edit_price: row.can_edit_price ?? false,
          can_post:       row.can_post       ?? false,
          can_print:      row.can_print      ?? false,
          can_export:     row.can_export     ?? false,
        }
      }
    }
  }

  return (
    <DashboardShell
      profile={profile}
      brand={brand}
      initialPermissions={initialPermissions}
      isSuperAdmin={isSuperAdmin}
      roleName={roleName}
    >
      {children}
    </DashboardShell>
  )
}

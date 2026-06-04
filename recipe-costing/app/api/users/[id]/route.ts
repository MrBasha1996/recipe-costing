import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAccountant() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('role').eq('id', user.id).single()
  return profile?.role === 'accountant' ? user : null
}

// ── PATCH /api/users/[id] — update profile ───────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireAccountant()
  if (!caller) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params
  const { name_ar, brand_access, role_id } = await request.json()

  const admin = createAdminClient()

  // Auto-compute legacy role from RBAC group (keeps RLS working)
  const legacyRole = role_id !== undefined
    ? await (async () => {
        if (!role_id) return 'ops'
        const { data } = await admin.from('roles').select('is_super_admin').eq('id', role_id).single()
        return data?.is_super_admin ? 'accountant' : 'ops'
      })()
    : undefined

  const updatePayload: Record<string, unknown> = { name_ar, brand_access }
  if (role_id !== undefined) {
    updatePayload.role_id = role_id ?? null
    if (legacyRole) updatePayload.role = legacyRole
  }

  const { error } = await admin
    .from('user_profiles')
    .update(updatePayload)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// ── DELETE /api/users/[id] — delete user ─────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireAccountant()
  if (!caller) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params

  // Prevent self-deletion
  if (caller.id === id) {
    return NextResponse.json({ error: 'لا يمكنك حذف حسابك الخاص' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Delete profile first (FK constraint), then auth user
  await admin.from('user_profiles').delete().eq('id', id)
  const { error } = await admin.auth.admin.deleteUser(id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

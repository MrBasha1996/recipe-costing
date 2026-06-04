import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('role_id, roles(is_super_admin)')
    .eq('id', user.id)
    .single()

  return (profile?.roles as any)?.is_super_admin ? user : null
}

// ── PATCH /api/users/[id] — update profile ───────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireSuperAdmin()
  if (!caller) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params
  const { name_ar, brand_access, role_id } = await request.json()

  const admin = createAdminClient()

  const updatePayload: Record<string, unknown> = { name_ar, brand_access }
  if (role_id !== undefined) updatePayload.role_id = role_id ?? null

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
  const caller = await requireSuperAdmin()
  if (!caller) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params

  if (caller.id === id) {
    return NextResponse.json({ error: 'لا يمكنك حذف حسابك الخاص' }, { status: 400 })
  }

  const admin = createAdminClient()

  await admin.from('user_profiles').delete().eq('id', id)
  const { error } = await admin.auth.admin.deleteUser(id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

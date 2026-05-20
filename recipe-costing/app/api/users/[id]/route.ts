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
  const { name_ar, role, brand_access } = await request.json()

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_profiles')
    .update({ name_ar, role, brand_access })
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

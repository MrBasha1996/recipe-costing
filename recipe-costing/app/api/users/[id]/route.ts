import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin, isAuthError } from '@/lib/auth'

const UpdateUserSchema = z.object({
  name_ar:      z.string().min(1).optional(),
  brand_access: z.string().min(1).optional(),
  role_id:      z.string().uuid().nullable().optional(),
})

// ── PATCH /api/users/[id] — update profile ───────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireSuperAdmin()
  if (isAuthError(caller)) return caller

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body غير صالح' }, { status: 400 })
  }

  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })
  }

  const { id } = await params
  const { name_ar, brand_access, role_id } = parsed.data

  const admin = createAdminClient()
  const updatePayload: Record<string, unknown> = {}
  if (name_ar      !== undefined) updatePayload.name_ar      = name_ar
  if (brand_access !== undefined) updatePayload.brand_access = brand_access
  if (role_id      !== undefined) updatePayload.role_id      = role_id ?? null

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
  if (isAuthError(caller)) return caller

  const { id } = await params

  if (caller.id === id) {
    return NextResponse.json({ error: 'لا يمكنك حذف حسابك الخاص' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: deletedProfile } = await admin
    .from('user_profiles')
    .select('name_ar, brand_access, role_id')
    .eq('id', id)
    .maybeSingle()

  await admin.from('user_profiles').delete().eq('id', id)
  const { error } = await admin.auth.admin.deleteUser(id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await (admin.from('rbac_audit_logs') as any).insert({
    performed_by: caller.id,
    action:       'user_deleted',
    entity_type:  'user',
    entity_id:    id,
    entity_name:  deletedProfile?.name_ar ?? id,
    old_data:     deletedProfile ?? null,
  })

  return NextResponse.json({ ok: true })
}

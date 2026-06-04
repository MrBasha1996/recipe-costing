import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Guard: caller must be accountant ─────────────────────────────
async function requireAccountant() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'accountant' ? user : null
}

/**
 * Derive the legacy `role` text field from the RBAC role.
 * - Super Admin role  → 'accountant' (full DB-level access via RLS)
 * - Any other role    → 'ops'        (read/write access, limited delete)
 * This keeps existing RLS policies working alongside the new RBAC system.
 */
async function deriveOldRole(role_id: string | null | undefined, admin: ReturnType<typeof createAdminClient>): Promise<string> {
  if (!role_id) return 'ops'
  const { data } = await admin.from('roles').select('is_super_admin').eq('id', role_id).single()
  return data?.is_super_admin ? 'accountant' : 'ops'
}

// ── POST /api/users — create new user ────────────────────────────
export async function POST(request: NextRequest) {
  const caller = await requireAccountant()
  if (!caller) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { email, password, username, name_ar, brand_access, role_id } = await request.json()

  if (!email || !password || !username || !name_ar || !brand_access) {
    return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Auto-compute legacy role from RBAC group
  const legacyRole = await deriveOldRole(role_id, admin)

  // Create Supabase Auth user
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  const profilePayload: Record<string, unknown> = {
    id: authData.user.id,
    username,
    name_ar,
    role: legacyRole,
    brand_access,
    role_id: role_id || null,
  }

  const { error: profileErr } = await admin.from('user_profiles').insert(profilePayload)

  if (profileErr) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ id: authData.user.id }, { status: 201 })
}

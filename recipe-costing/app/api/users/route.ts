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

// ── POST /api/users — create new user ────────────────────────────
export async function POST(request: NextRequest) {
  const caller = await requireAccountant()
  if (!caller) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { email, password, username, name_ar, role, brand_access } = await request.json()

  if (!email || !password || !username || !name_ar || !role || !brand_access) {
    return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Create Supabase Auth user
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  // Create user_profile row
  const { error: profileErr } = await admin.from('user_profiles').insert({
    id: authData.user.id,
    username,
    name_ar,
    role,
    brand_access,
  })

  if (profileErr) {
    // Rollback auth user
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ id: authData.user.id }, { status: 201 })
}

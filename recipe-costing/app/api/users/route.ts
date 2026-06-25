import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin, isAuthError } from '@/lib/auth'

const CreateUserSchema = z.object({
  email:        z.string().email(),
  password:     z.string().min(8),
  username:     z.string().min(1),
  name_ar:      z.string().min(1),
  brand_access: z.string().min(1),
  role_id:      z.string().uuid().nullable().optional(),
})

// ── POST /api/users — create new user ────────────────────────────
export async function POST(request: NextRequest) {
  const caller = await requireSuperAdmin()
  if (isAuthError(caller)) return caller

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body غير صالح' }, { status: 400 })
  }

  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })
  }

  const { email, password, username, name_ar, brand_access, role_id } = parsed.data
  const admin = createAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  const { error: profileErr } = await admin.from('user_profiles').insert({
    id: authData.user.id,
    username,
    name_ar,
    brand_access,
    role_id: role_id ?? null,
  })

  if (profileErr) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ id: authData.user.id }, { status: 201 })
}

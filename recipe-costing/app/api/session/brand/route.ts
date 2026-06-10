import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const PostSchema = z.object({
  brand_id: z.string().min(1),
})

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
}

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body غير صالح' }, { status: 400 })
  }

  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'brand_id مطلوب' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await (supabase.from('user_profiles') as any)
    .select('brand_access')
    .eq('id', user.id)
    .single()

  const { brand_id } = parsed.data
  if (!profile || (profile.brand_access !== 'all' && profile.brand_access !== brand_id)) {
    return NextResponse.json({ error: 'ليس لديك صلاحية لهذا البراند' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('brand_session', brand_id, COOKIE_OPTS)
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('brand_session')
  return res
}

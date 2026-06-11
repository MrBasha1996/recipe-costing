import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBrandAccess, isAuthError } from '@/lib/auth'

// POST /api/production/sessions/[id]/approve?brand_id=X
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const brand_id = searchParams.get('brand_id') ?? ''
  if (!brand_id) return NextResponse.json({ error: 'brand_id مطلوب' }, { status: 400 })

  const user = await requireBrandAccess(brand_id)
  if (isAuthError(user)) return user

  const admin = createAdminClient()

  const { data: session, error: fetchErr } = await (admin.from('production_sessions') as any)
    .select('id, brand_id, status')
    .eq('id', id)
    .eq('brand_id', brand_id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 })

  if ((session as any).status === 'approved') {
    return NextResponse.json({ error: 'الجلسة معتمدة مسبقاً' }, { status: 409 })
  }

  const { error } = await (admin.from('production_sessions') as any)
    .update({
      status:      'approved',
      approved_by: (user as any).id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

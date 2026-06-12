import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModulePermission, isAuthError } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const admin = createAdminClient()

  // Fetch session first (admin client) to get brand_id for permission check
  const { data: session, error: fetchErr } = await (admin.from('stocktake_sessions') as any)
    .select('id, status, brand_id')
    .eq('id', id)
    .single()

  if (fetchErr || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Enforce brand access + inventory:approve permission
  const user = await requireModulePermission(session.brand_id, 'inventory', 'approve')
  if (isAuthError(user)) return user

  if (session.status !== 'finalized') {
    return NextResponse.json({ error: 'يجب إنهاء الجرد قبل الاعتماد' }, { status: 400 })
  }

  const { error } = await (admin.from('stocktake_sessions') as any)
    .update({ approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

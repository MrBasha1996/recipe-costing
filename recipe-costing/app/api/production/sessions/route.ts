import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBrandAccess, isAuthError } from '@/lib/auth'

// GET /api/production/sessions?brand_id=X&limit=50&offset=0
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const brand_id = searchParams.get('brand_id') ?? ''
  const limit    = Math.min(parseInt(searchParams.get('limit')  ?? '50'), 200)
  const offset   = parseInt(searchParams.get('offset') ?? '0')

  if (!brand_id) return NextResponse.json({ error: 'brand_id مطلوب' }, { status: 400 })

  const user = await requireBrandAccess(brand_id)
  if (isAuthError(user)) return user

  const admin = createAdminClient()

  const { data, error, count } = await (admin.from('production_sessions') as any)
    .select(`
      id, batch_sku, batch_name, qty_portions, status,
      note, cost_estimate, warnings, created_at, approved_at,
      performed_by, approved_by
    `, { count: 'exact' })
    .eq('brand_id', brand_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // جلب أسماء المستخدمين
  const userIds = new Set<string>()
  for (const s of (data ?? []) as any[]) {
    if (s.performed_by) userIds.add(s.performed_by)
    if (s.approved_by)  userIds.add(s.approved_by)
  }

  let usersMap: Record<string, string> = {}
  if (userIds.size > 0) {
    const { data: users } = await (admin.from('user_profiles') as any)
      .select('id, name_ar').in('id', Array.from(userIds))
    for (const u of (users ?? []) as any[]) usersMap[u.id] = u.name_ar
  }

  const sessions = ((data ?? []) as any[]).map((s: any) => ({
    ...s,
    performed_by_name: s.performed_by ? (usersMap[s.performed_by] ?? '—') : '—',
    approved_by_name:  s.approved_by  ? (usersMap[s.approved_by]  ?? '—') : null,
  }))

  return NextResponse.json({ sessions, total: count ?? 0 })
}

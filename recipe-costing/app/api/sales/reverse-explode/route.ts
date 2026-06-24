import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModulePermission, isAuthError } from '@/lib/auth'

const BodySchema = z.object({
  brand_id:     z.string().min(1),
  import_batch: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body غير صالح' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })
  }

  const { brand_id, import_batch } = parsed.data

  const user = await requireModulePermission(brand_id, 'sales', 'delete')
  if (isAuthError(user)) return user

  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc('reverse_explode_batch', {
    p_brand_id:     brand_id,
    p_import_batch: import_batch,
    p_reversed_by:  (user as any).id,
  })

  if (error) {
    const status = error.message?.includes('مُغلقة') ? 423
      : error.message?.includes('غير موجودة') || error.message?.includes('لم تُحتسب') ? 404
      : error.message?.includes('لا يمكن عكسها') ? 409
      : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json(data)
}

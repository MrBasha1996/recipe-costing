import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModulePermission, isAuthError } from '@/lib/auth'

const BodySchema = z.object({
  brand_id: z.string().min(1),
  session_items: z.array(z.object({
    id:         z.string().uuid(),
    ing_sku:    z.string(),
    ing_name:   z.string(),
    unit:       z.string(),
    actual_qty: z.number().min(0),
    unit_cost:  z.number().default(0),
    min_qty:    z.number().default(0),
  })).min(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body غير صالح' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })
  }

  const { brand_id, session_items } = parsed.data

  const user = await requireModulePermission(brand_id, 'inventory', 'create')
  if (isAuthError(user)) return user

  const admin = createAdminClient()

  // Validate session exists, belongs to brand, and is open
  const { data: session } = await (admin.from('stocktake_sessions') as any)
    .select('id, brand_id, status, session_date')
    .eq('id', id)
    .eq('brand_id', brand_id)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 })
  if ((session as any).status !== 'open') {
    return NextResponse.json({ error: 'الجلسة مكتملة مسبقاً' }, { status: 409 })
  }

  // Period close guard
  const { data: brandRow } = await (admin.from('brands') as any)
    .select('closed_up_to').eq('id', brand_id).maybeSingle()
  if (brandRow?.closed_up_to) {
    const sessionYM = ((session as any).session_date as string).slice(0, 7)
    if (sessionYM <= brandRow.closed_up_to) {
      return NextResponse.json(
        { error: `الفترة ${sessionYM} مُغلقة — لا يمكن إنهاء جرد في فترة مُغلقة` },
        { status: 423 }
      )
    }
  }

  // Save actual_qty values to stocktake_items — .eq('session_id') prevents writing items from a different session
  for (const item of session_items) {
    await (admin.from('stocktake_items') as any)
      .update({ actual_qty: item.actual_qty })
      .eq('id', item.id)
      .eq('session_id', id)
  }

  // Fetch live stock quantities at finalize time
  const ingSkus = session_items.map(i => i.ing_sku)
  const { data: liveStock } = await (admin.from('stock_items') as any)
    .select('ing_sku, current_qty')
    .eq('brand_id', brand_id)
    .in('ing_sku', ingSkus)

  const liveQtyMap = new Map<string, number>(
    ((liveStock ?? []) as any[]).map((s: any) => [s.ing_sku, (s.current_qty ?? 0) as number])
  )

  const note = `جرد دوري — ${(session as any).session_date}`
  const performedBy = (user as any).id ?? null

  const adjustments = session_items.map(item => {
    const liveQty = liveQtyMap.get(item.ing_sku) ?? 0
    const variance = item.actual_qty - liveQty
    return {
      ing_sku:     item.ing_sku,
      ing_name:    item.ing_name,
      unit:        item.unit,
      actual_qty:  item.actual_qty,
      min_qty:     item.min_qty,
      variance,
      value:       Math.round(variance * item.unit_cost * 10000) / 10000,
      note,
      performed_by: performedBy,
    }
  })

  const { error: rpcErr } = await (admin as any).rpc('apply_stocktake_writes', {
    p_session_id:  id,
    p_brand_id:    brand_id,
    p_adjustments: adjustments,
    p_note:        note,
  })

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

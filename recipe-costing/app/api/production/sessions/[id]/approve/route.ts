import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModulePermission, isAuthError } from '@/lib/auth'

// POST /api/production/sessions/[id]/approve?brand_id=X
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const brand_id = searchParams.get('brand_id') ?? ''
  if (!brand_id) return NextResponse.json({ error: 'brand_id مطلوب' }, { status: 400 })

  const user = await requireModulePermission(brand_id, 'production', 'approve')
  if (isAuthError(user)) return user

  const admin = createAdminClient()

  const { data: session, error: fetchErr } = await (admin.from('production_sessions') as any)
    .select('id, brand_id, status, batch_sku, batch_name, qty_portions, note, actuals_json')
    .eq('id', id)
    .eq('brand_id', brand_id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 })

  if ((session as any).status === 'approved') {
    return NextResponse.json({ error: 'الجلسة معتمدة مسبقاً' }, { status: 409 })
  }

  const actuals = (session as any).actuals_json
  if (!actuals?.needs?.length) {
    return NextResponse.json({ error: 'بيانات الإنتاج غير موجودة في الجلسة' }, { status: 422 })
  }

  const needs: { sku: string; name: string; unit: string; needed: number }[] = actuals.needs

  // Fetch live stock at approve time — not the snapshot from when draft was created
  const allSkus = needs.map(n => n.sku)
  const { data: stockRows } = await (admin.from('stock_items') as any)
    .select('ing_sku, current_qty, min_qty, unit')
    .eq('brand_id', brand_id)
    .in('ing_sku', allSkus)

  const stockMap = new Map<string, { current_qty: number; min_qty: number; unit: string }>()
  for (const s of (stockRows ?? []) as any[]) {
    stockMap.set(s.ing_sku, { current_qty: s.current_qty, min_qty: s.min_qty, unit: s.unit })
  }

  const { data: batchStock } = await (admin.from('stock_items') as any)
    .select('current_qty, min_qty, unit')
    .eq('brand_id', brand_id)
    .eq('ing_sku', (session as any).batch_sku)
    .maybeSingle()

  const batchCurrentQty = (batchStock as any)?.current_qty ?? 0
  const batchNewQty = batchCurrentQty + (session as any).qty_portions

  const deductions = needs.map(n => ({
    ing_sku:     n.sku,
    ing_name:    n.name,
    unit:        n.unit,
    current_qty: Math.max(0, (stockMap.get(n.sku)?.current_qty ?? 0) - n.needed),
    min_qty:     stockMap.get(n.sku)?.min_qty ?? 0,
    qty:         Math.round(n.needed * 1000) / 1000,
  }))

  const prodNote = (session as any).note ?? `إنتاج باتش — ${(session as any).batch_name} × ${(session as any).qty_portions}`

  const { error: rpcErr } = await (admin as any).rpc('apply_produce_writes', {
    p_brand_id:           brand_id,
    p_session_id:         id,
    p_deductions:         deductions,
    p_batch_sku:          (session as any).batch_sku,
    p_batch_name:         (session as any).batch_name,
    p_batch_new_qty:      batchNewQty,
    p_batch_qty_produced: (session as any).qty_portions,
    p_batch_unit:         actuals.batch_unit ?? 'حصة',
    p_batch_min_qty:      actuals.batch_min_qty ?? 0,
    p_note:               prodNote,
    p_performed_by:       (user as any).id,
    p_batch_value:        actuals.batch_value ?? 0,
  })

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

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

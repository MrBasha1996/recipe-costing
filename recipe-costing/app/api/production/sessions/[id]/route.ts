import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModulePermission, isAuthError } from '@/lib/auth'

// ── مساعد: جلب الجلسة والتحقق من الملكية ───────────────────────────
async function getSession(admin: any, id: string, brand_id: string) {
  const { data, error } = await (admin.from('production_sessions') as any)
    .select('id, brand_id, status, batch_sku, batch_name, qty_portions')
    .eq('id', id)
    .eq('brand_id', brand_id)
    .maybeSingle()
  if (error) return { error: error.message, status: 500 }
  if (!data)  return { error: 'الجلسة غير موجودة', status: 404 }
  return { session: data as any }
}

// ── PATCH /api/production/sessions/[id]?brand_id=X ─────────────────
// تعديل الملاحظة أو المنفذ (مسموح فقط بحالة draft)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const brand_id = searchParams.get('brand_id') ?? ''
  if (!brand_id) return NextResponse.json({ error: 'brand_id مطلوب' }, { status: 400 })

  const user = await requireModulePermission(brand_id, 'production', 'update')
  if (isAuthError(user)) return user

  const Schema = z.object({
    note: z.string().max(500).optional(),
  })
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body غير صالح' }, { status: 400 })
  }
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })

  const admin = createAdminClient()
  const got = await getSession(admin, id, brand_id)
  if ('error' in got) return NextResponse.json({ error: got.error }, { status: got.status })

  if (got.session.status === 'approved') {
    return NextResponse.json({ error: 'لا يمكن تعديل جلسة معتمدة' }, { status: 403 })
  }

  const { error } = await (admin.from('production_sessions') as any)
    .update({ note: parsed.data.note })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE /api/production/sessions/[id]?brand_id=X ────────────────
// حذف الجلسة وعكس حركات المخزون (ممنوع إذا كانت معتمدة)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const brand_id = searchParams.get('brand_id') ?? ''
  if (!brand_id) return NextResponse.json({ error: 'brand_id مطلوب' }, { status: 400 })

  const user = await requireModulePermission(brand_id, 'production', 'delete')
  if (isAuthError(user)) return user

  const admin = createAdminClient()
  const got = await getSession(admin, id, brand_id)
  if ('error' in got) return NextResponse.json({ error: got.error }, { status: got.status })

  if (got.session.status === 'approved') {
    return NextResponse.json({ error: 'لا يمكن حذف جلسة معتمدة' }, { status: 403 })
  }

  // جلب حركات الجلسة لعكس المخزون
  const { data: movements } = await (admin.from('stock_movements') as any)
    .select('ing_sku, ing_name, unit, qty, movement_type')
    .eq('production_session_id', id)
    .eq('brand_id', brand_id)

  if (movements?.length) {
    // عكس كل حركة: out→ يُضاف، in→ يُطرح
    for (const mv of movements as any[]) {
      const delta = mv.movement_type === 'out' ? mv.qty : -mv.qty

      const { data: stockRow } = await (admin.from('stock_items') as any)
        .select('current_qty, min_qty, unit')
        .eq('brand_id', brand_id)
        .eq('ing_sku', mv.ing_sku)
        .maybeSingle()

      const currentQty = (stockRow as any)?.current_qty ?? 0
      await (admin.from('stock_items') as any).upsert({
        brand_id,
        ing_sku:     mv.ing_sku,
        ing_name:    mv.ing_name,
        unit:        mv.unit,
        current_qty: Math.max(0, currentQty + delta),
        min_qty:     (stockRow as any)?.min_qty ?? 0,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'brand_id,ing_sku' })
    }

    // حذف الحركات
    await (admin.from('stock_movements') as any)
      .delete()
      .eq('production_session_id', id)
  }

  // حذف الجلسة
  const { error } = await (admin.from('production_sessions') as any)
    .delete()
    .eq('id', id)
    .eq('brand_id', brand_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

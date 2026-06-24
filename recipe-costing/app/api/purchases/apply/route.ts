import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModulePermission, isAuthError } from '@/lib/auth'

const BodySchema = z.object({
  brand_id:     z.string().min(1),
  import_batch: z.string().uuid(),
  performed_by: z.string().optional().nullable(),
})

/**
 * POST /api/purchases/apply
 * Applies a purchase batch using Weighted Average Cost (WAC).
 *
 * Body: { brand_id, import_batch, performed_by? }
 *
 * For each purchased ingredient:
 *   WAC = (stock_qty × old_cost + purchased_qty × purchase_price) / (stock_qty + purchased_qty)
 *
 * Also:
 *   - Updates stock_items.current_qty (adds purchased qty)
 *   - Records price changes in price_history
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body غير صالح' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })
  }

  const user = await requireModulePermission(parsed.data.brand_id, 'purchasing', 'create')
  if (isAuthError(user)) return user

  const { brand_id, import_batch, performed_by } = parsed.data

  const admin = createAdminClient()

  // ── 0. Period close guard ─────────────────────────────────────────
  const { data: brandRow } = await (admin.from('brands') as any)
    .select('closed_up_to').eq('id', brand_id).maybeSingle()
  if (brandRow?.closed_up_to) {
    const { data: earliestRow } = await (admin.from('purchases') as any)
      .select('purchase_date').eq('brand_id', brand_id).eq('import_batch', import_batch)
      .order('purchase_date', { ascending: true }).limit(1).maybeSingle()
    if (earliestRow?.purchase_date) {
      const batchYM = (earliestRow.purchase_date as string).slice(0, 7)
      if (batchYM <= brandRow.closed_up_to) {
        return NextResponse.json(
          { error: `الفترة ${batchYM} مُغلقة — لا يمكن تطبيق مشتريات بتاريخ مُغلق` },
          { status: 423 }
        )
      }
    }
  }

  // ── 1. Atomic WAC: حساب وتطبيق المتوسط المرجّح بـ SELECT FOR UPDATE ──
  const { data: wacResult, error: wacErr } = await (admin as any).rpc('apply_purchase_wac', {
    p_brand_id:     brand_id,
    p_import_batch: import_batch,
    p_performed_by: performed_by ?? null,
  })

  if (wacErr) return NextResponse.json({ error: wacErr.message }, { status: 500 })

  const wac = wacResult as { ok: boolean; updated: number; stock_updated: number; price_history: number; changed_ingredients: { sku: string; new_cost: number }[] }

  if (!wac?.ok) return NextResponse.json({ updated: 0, stock_updated: 0, price_history: 0, recipes_updated: 0 })

  const ingredientUpdates = wac.changed_ingredients ?? []

  // ── 2. Cascade: recalculate recipe costs for affected recipes ────────
  // استدعاء RPC واحد بدلاً من N+M+K طلبات تسلسلية
  let recipesUpdated = 0
  if (ingredientUpdates.length > 0) {
    const { data: cascadeResult, error: cascadeErr } = await (admin as any).rpc(
      'apply_recipe_cost_cascade',
      {
        p_brand_id:     brand_id,
        p_changed_skus: ingredientUpdates,
      }
    )

    if (cascadeErr) return NextResponse.json({ error: cascadeErr.message }, { status: 500 })
    recipesUpdated = (cascadeResult as any)?.recipes_updated ?? 0
  }

  await (admin.from('audit_logs') as any).insert({
    brand_id,
    action:       'purchases_applied',
    entity_type:  'purchase_batch',
    entity_sku:   import_batch,
    performed_by: (user as any).id,
    metadata: {
      updated:         wac.updated,
      stock_updated:   wac.stock_updated,
      price_history:   wac.price_history,
      recipes_updated: recipesUpdated,
    },
  })

  return NextResponse.json({
    ok: true,
    updated:         wac.updated,
    stock_updated:   wac.stock_updated,
    price_history:   wac.price_history,
    recipes_updated: recipesUpdated,
  })
}

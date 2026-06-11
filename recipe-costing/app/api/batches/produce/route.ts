import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBrandAccess, isAuthError } from '@/lib/auth'
import { executeBatchProduce } from '@/lib/produceBatch'

const ActualSchema = z.object({
  ing_sku:  z.string(),
  ing_name: z.string(),
  unit:     z.string(),
  qty:      z.number().nonnegative(),
})

const BodySchema = z.object({
  brand_id:     z.string().min(1),
  batch_sku:    z.string().min(1),
  qty_portions: z.number().positive(),
  dry_run:      z.boolean().optional().default(false),
  note:         z.string().optional(),
  performed_by: z.string().uuid().nullable().optional().default(null),
  actuals:      z.array(ActualSchema).optional(),
})

/**
 * POST /api/batches/produce
 * ينتج كمية من باتش معيّن: يخصم المواد الخام ويضيف الباتش للمخزون.
 *
 * dry_run=true → حساب فقط بدون كتابة في DB (للمعاينة)
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

  const user = await requireBrandAccess(parsed.data.brand_id)
  if (isAuthError(user)) return user

  const { brand_id, batch_sku, qty_portions, dry_run, note: userNote, performed_by, actuals } = parsed.data
  const admin = createAdminClient()

  // ── dry_run: حساب بدون كتابة ──────────────────────────────────────
  if (dry_run) {
    const { data: recipeRow, error: recipeErr } = await (admin.from('recipes') as any)
      .select('id, yield_portions, product_name, total_cost')
      .eq('brand_id', brand_id)
      .eq('sku', batch_sku)
      .eq('is_active', true)
      .single()

    if (recipeErr || !recipeRow) {
      return NextResponse.json({ error: 'لا توجد وصفة نشطة لهذا الباتش' }, { status: 404 })
    }

    const recipe = recipeRow as any
    const yieldPortions = Math.max(recipe.yield_portions, 1)

    const { data: ings, error: ingErr } = await (admin.from('recipe_ingredients') as any)
      .select('ing_sku, ing_name, qty, yield_pct, unit, is_semi')
      .eq('recipe_id', recipe.id)

    if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 })
    if (!ings?.length) return NextResponse.json({ error: 'الوصفة لا تحتوي على مكونات' }, { status: 400 })

    const ingSkusForUC = (ings as any[]).map((i: any) => i.ing_sku)
    const { data: ucRows } = await (admin.from('unit_conversions') as any)
      .select('ing_sku, factor')
      .eq('brand_id', brand_id)
      .in('ing_sku', ingSkusForUC)
    const ucMap = new Map<string, number>()
    for (const uc of (ucRows || []) as any[]) ucMap.set(uc.ing_sku, uc.factor)

    type IngNeed = { sku: string; name: string; unit: string; needed: number; is_semi: boolean }
    const needs: IngNeed[] = []
    for (const ing of ings as any[]) {
      if ((ing.yield_pct ?? 0) <= 0) continue
      const factor = ucMap.get(ing.ing_sku) ?? 1
      const needed = ((ing.qty / (ing.yield_pct / 100)) / yieldPortions * qty_portions) / factor
      needs.push({ sku: ing.ing_sku, name: ing.ing_name, unit: ing.unit ?? '—', needed, is_semi: ing.is_semi })
    }

    const { data: stockRows } = await (admin.from('stock_items') as any)
      .select('ing_sku, current_qty, min_qty, unit')
      .eq('brand_id', brand_id)
      .in('ing_sku', needs.map(n => n.sku))

    const stockMap = new Map<string, { current_qty: number; min_qty: number; unit: string }>()
    for (const s of (stockRows || []) as any[])
      stockMap.set(s.ing_sku, { current_qty: s.current_qty, min_qty: s.min_qty, unit: s.unit })

    const { data: batchStock } = await (admin.from('stock_items') as any)
      .select('current_qty')
      .eq('brand_id', brand_id)
      .eq('ing_sku', batch_sku)
      .maybeSingle()

    type IngReport = IngNeed & { in_stock: number; deficit: number; sufficient: boolean }
    const report: IngReport[] = needs.map(n => {
      const inStock = stockMap.get(n.sku)?.current_qty ?? 0
      const deficit = Math.max(0, n.needed - inStock)
      return { ...n, in_stock: inStock, deficit, sufficient: deficit === 0 }
    })

    return NextResponse.json({
      dry_run: true,
      batch_sku,
      batch_name: recipe.product_name,
      qty_portions,
      yield_portions: yieldPortions,
      ingredients: report,
      all_sufficient: report.every(r => r.sufficient),
      cost_estimate: (recipe.total_cost / yieldPortions) * qty_portions,
      batch_current_stock: (batchStock as any)?.current_qty ?? 0,
    })
  }

  // ── تنفيذ الإنتاج الفعلي ──────────────────────────────────────────
  const result = await executeBatchProduce(admin, {
    brand_id,
    batch_sku,
    qty_portions,
    performed_by: performed_by ?? null,
    note: userNote,
    actuals: actuals?.length ? actuals : undefined,
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
}

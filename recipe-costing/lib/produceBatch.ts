import type { SupabaseClient } from '@supabase/supabase-js'

export type ProduceResult =
  | {
      ok: true
      batch_name: string
      qty_produced: number
      batch_new_stock: number
      ingredients_deducted: number
      warnings: string[]
    }
  | { error: string; status: number }

/**
 * Core batch production logic — shared between:
 *   - POST /api/batches/produce  (user-triggered)
 *   - POST /api/sales/explode    (auto_produce mode)
 *
 * Does NOT perform authentication — callers are responsible for auth.
 * Uses the admin client so RLS is bypassed intentionally.
 */
export async function executeBatchProduce(
  admin: SupabaseClient,
  params: {
    brand_id: string
    batch_sku: string
    qty_portions: number
    performed_by: string | null
    note?: string
  },
): Promise<ProduceResult> {
  const { brand_id, batch_sku, qty_portions, performed_by, note: userNote } = params

  // ── 1. جلب الوصفة النشطة ──────────────────────────────────────────
  const { data: recipeRow, error: recipeErr } = await (admin.from('recipes') as any)
    .select('id, yield_portions, product_name, total_cost')
    .eq('brand_id', brand_id)
    .eq('sku', batch_sku)
    .eq('is_active', true)
    .single()

  if (recipeErr || !recipeRow) {
    return { error: 'لا توجد وصفة نشطة لهذا الباتش', status: 404 }
  }

  const recipe = recipeRow as any
  const yieldPortions = Math.max(recipe.yield_portions, 1)

  // ── 2. جلب مكونات الوصفة ─────────────────────────────────────────
  const { data: ings, error: ingErr } = await (admin.from('recipe_ingredients') as any)
    .select('ing_sku, ing_name, qty, yield_pct, unit, is_semi')
    .eq('recipe_id', recipe.id)

  if (ingErr) return { error: ingErr.message, status: 500 }
  if (!ings?.length) return { error: 'الوصفة لا تحتوي على مكونات', status: 400 }

  // ── 3. معاملات تحويل الوحدات ──────────────────────────────────────
  const ingSkus = (ings as any[]).map((i: any) => i.ing_sku)
  const { data: ucRows } = await (admin.from('unit_conversions') as any)
    .select('ing_sku, factor')
    .eq('brand_id', brand_id)
    .in('ing_sku', ingSkus)
  const ucMap = new Map<string, number>()
  for (const uc of (ucRows || []) as any[]) ucMap.set(uc.ing_sku, uc.factor)

  // ── 4. حساب الاحتياجات ────────────────────────────────────────────
  type IngNeed = { sku: string; name: string; unit: string; needed: number }
  const needs: IngNeed[] = []
  for (const ing of ings as any[]) {
    if ((ing.yield_pct ?? 0) <= 0) continue
    const factor = ucMap.get(ing.ing_sku) ?? 1
    const needed = ((ing.qty / (ing.yield_pct / 100)) / yieldPortions * qty_portions) / factor
    needs.push({ sku: ing.ing_sku, name: ing.ing_name, unit: ing.unit ?? '—', needed })
  }

  // ── 5. جلب المخزون الحالي ────────────────────────────────────────
  const { data: stockRows } = await (admin.from('stock_items') as any)
    .select('ing_sku, current_qty, min_qty, unit')
    .eq('brand_id', brand_id)
    .in('ing_sku', needs.map(n => n.sku))

  const stockMap = new Map<string, { current_qty: number; min_qty: number; unit: string }>()
  for (const s of (stockRows || []) as any[])
    stockMap.set(s.ing_sku, { current_qty: s.current_qty, min_qty: s.min_qty, unit: s.unit })

  const { data: batchStock } = await (admin.from('stock_items') as any)
    .select('current_qty, min_qty, unit, ing_name')
    .eq('brand_id', brand_id)
    .eq('ing_sku', batch_sku)
    .maybeSingle()

  // ── 6. تنفيذ الإنتاج ─────────────────────────────────────────────
  const prodNote = userNote || `إنتاج باتش — ${recipe.product_name} × ${qty_portions}`
  const now = new Date().toISOString()

  const deductUpserts: any[] = []
  const deductMovements: any[] = []
  const warnings: string[] = []

  for (const n of needs) {
    const currentQty = stockMap.get(n.sku)?.current_qty ?? 0
    if (currentQty < n.needed) {
      warnings.push(`${n.name}: احتجنا ${n.needed.toFixed(3)} ولكن في المخزون ${currentQty.toFixed(3)}`)
    }
    const newQty = Math.max(0, currentQty - n.needed)
    deductUpserts.push({
      brand_id, ing_sku: n.sku, ing_name: n.name, unit: n.unit,
      current_qty: newQty, min_qty: stockMap.get(n.sku)?.min_qty ?? 0,
      updated_at: now,
    })
    deductMovements.push({
      brand_id, ing_sku: n.sku, ing_name: n.name,
      movement_type: 'out',
      qty: Math.round(n.needed * 1000) / 1000,
      note: prodNote, performed_by,
    })
  }

  const { error: deductErr } = await (admin.from('stock_items') as any)
    .upsert(deductUpserts, { onConflict: 'brand_id,ing_sku' })
  if (deductErr) return { error: deductErr.message, status: 500 }

  await (admin.from('stock_movements') as any).insert(deductMovements)

  // إضافة الباتش المنتج للمخزون
  const batchCurrentQty = (batchStock as any)?.current_qty ?? 0
  const batchNewQty = batchCurrentQty + qty_portions

  await (admin.from('stock_items') as any).upsert({
    brand_id, ing_sku: batch_sku,
    ing_name: recipe.product_name,
    unit: (batchStock as any)?.unit ?? 'حصة',
    current_qty: batchNewQty,
    min_qty: (batchStock as any)?.min_qty ?? 0,
    updated_at: now,
  }, { onConflict: 'brand_id,ing_sku' })

  await (admin.from('stock_movements') as any).insert({
    brand_id, ing_sku: batch_sku, ing_name: recipe.product_name,
    movement_type: 'in',
    qty: qty_portions,
    note: prodNote, performed_by,
  })

  return {
    ok: true,
    batch_name: recipe.product_name,
    qty_produced: qty_portions,
    batch_new_stock: batchNewQty,
    ingredients_deducted: needs.length,
    warnings,
  }
}

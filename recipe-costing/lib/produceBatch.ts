import type { SupabaseClient } from '@supabase/supabase-js'

export type ProduceResult =
  | {
      ok: true
      batch_name: string
      qty_produced: number
      batch_new_stock: number
      ingredients_deducted: number
      warnings: string[]
      session_id: string
    }
  | { error: string; status: number }

export interface ActualIngredient {
  ing_sku: string
  ing_name: string
  unit: string
  qty: number
}

/**
 * Core batch production logic.
 *
 * إذا مُرِّر actuals → يستخدم الكميات الفعلية مباشرة بدون حساب من الوصفة.
 * إذا لم يُمرَّر → يحسب الكميات من الوصفة النشطة (الوضع الافتراضي).
 */
export async function executeBatchProduce(
  admin: SupabaseClient,
  params: {
    brand_id: string
    batch_sku: string
    qty_portions: number
    performed_by: string | null
    note?: string
    actuals?: ActualIngredient[]
  },
): Promise<ProduceResult> {
  const { brand_id, batch_sku, qty_portions, performed_by, note: userNote, actuals } = params

  type IngNeed = { sku: string; name: string; unit: string; needed: number }
  let needs: IngNeed[]
  let batchName: string
  let costEstimate: number | null = null

  if (actuals?.length) {
    // ── مسار الكميات الفعلية ──────────────────────────────────────
    const { data: batchRow } = await (admin.from('batches') as any)
      .select('name')
      .eq('brand_id', brand_id)
      .eq('sku', batch_sku)
      .maybeSingle()

    if (!batchRow) return { error: 'لم يتم إيجاد الباتش', status: 404 }
    batchName = (batchRow as any).name

    needs = actuals
      .filter(a => a.qty > 0)
      .map(a => ({ sku: a.ing_sku, name: a.ing_name, unit: a.unit, needed: a.qty }))

    if (!needs.length) return { error: 'لا توجد كميات فعلية صالحة', status: 400 }

  } else {
    // ── مسار الوصفة (الافتراضي) ──────────────────────────────────
    const { data: recipeRow, error: recipeErr } = await (admin.from('recipes') as any)
      .select('id, yield_portions, product_name, total_cost')
      .eq('brand_id', brand_id)
      .eq('sku', batch_sku)
      .eq('is_active', true)
      .eq('is_approved', true)
      .maybeSingle()

    if (recipeErr || !recipeRow) {
      return { error: 'لا توجد وصفة معتمدة نشطة لهذا الباتش', status: 404 }
    }

    const recipe = recipeRow as any
    batchName = recipe.product_name
    const yieldPortions = Math.max(recipe.yield_portions, 1)
    costEstimate = (recipe.total_cost / yieldPortions) * qty_portions

    const { data: ings, error: ingErr } = await (admin.from('recipe_ingredients') as any)
      .select('ing_sku, ing_name, qty, yield_pct, unit, is_semi')
      .eq('recipe_id', recipe.id)

    if (ingErr) return { error: ingErr.message, status: 500 }
    if (!ings?.length) return { error: 'الوصفة لا تحتوي على مكونات', status: 400 }

    const ingSkus = (ings as any[]).map((i: any) => i.ing_sku)
    const { data: ucRows } = await (admin.from('unit_conversions') as any)
      .select('ing_sku, factor')
      .eq('brand_id', brand_id)
      .in('ing_sku', ingSkus)
    const ucMap = new Map<string, number>()
    for (const uc of (ucRows || []) as any[]) ucMap.set(uc.ing_sku, uc.factor)

    needs = []
    for (const ing of ings as any[]) {
      if ((ing.yield_pct ?? 0) <= 0) continue
      const factor = ucMap.get(ing.ing_sku) ?? 1
      const needed = ((ing.qty / (ing.yield_pct / 100)) / yieldPortions * qty_portions) / factor
      needs.push({ sku: ing.ing_sku, name: ing.ing_name, unit: ing.unit ?? '—', needed })
    }
  }

  // ── جلب المخزون الحالي ───────────────────────────────────────────
  const { data: stockRows } = await (admin.from('stock_items') as any)
    .select('ing_sku, current_qty, min_qty, unit')
    .eq('brand_id', brand_id)
    .in('ing_sku', needs.map(n => n.sku))

  const stockMap = new Map<string, { current_qty: number; min_qty: number; unit: string }>()
  for (const s of (stockRows || []) as any[])
    stockMap.set(s.ing_sku, { current_qty: s.current_qty, min_qty: s.min_qty, unit: s.unit })

  const { data: batchStock } = await (admin.from('stock_items') as any)
    .select('current_qty, min_qty, unit')
    .eq('brand_id', brand_id)
    .eq('ing_sku', batch_sku)
    .maybeSingle()

  // ── التحقق من توفر المخزون (تحذيرات فقط - لا خصم هنا) ──────────────
  const warnings: string[] = []
  for (const n of needs) {
    const currentQty = stockMap.get(n.sku)?.current_qty ?? 0
    if (currentQty < n.needed) {
      warnings.push(`${n.name}: احتجنا ${n.needed.toFixed(3)} ولكن في المخزون ${currentQty.toFixed(3)}`)
    }
  }

  const prodNote = userNote || `إنتاج باتش — ${batchName} × ${qty_portions}`
  const batchCurrentQty = (batchStock as any)?.current_qty ?? 0

  // ── حفظ الاحتياجات في actuals_json (الخصم يحدث عند الاعتماد لا هنا) ──
  const actuals_json = {
    needs: needs.map(n => ({ sku: n.sku, name: n.name, unit: n.unit, needed: n.needed })),
    batch_unit:     (batchStock as any)?.unit ?? 'حصة',
    batch_min_qty:  (batchStock as any)?.min_qty ?? 0,
    batch_value:    costEstimate ?? 0,
  }

  const { data: sessionRow, error: sessionErr } = await (admin.from('production_sessions') as any)
    .insert({
      brand_id,
      batch_sku,
      batch_name: batchName,
      qty_portions,
      status: 'draft',
      performed_by: performed_by ?? null,
      note: prodNote,
      cost_estimate: costEstimate,
      warnings: warnings,
      actuals_json,
    })
    .select('id')
    .single()

  if (sessionErr || !sessionRow) {
    return { error: sessionErr?.message ?? 'فشل إنشاء جلسة الإنتاج', status: 500 }
  }

  return {
    ok: true,
    batch_name: batchName,
    qty_produced: qty_portions,
    batch_new_stock: batchCurrentQty + qty_portions,
    ingredients_deducted: needs.length,
    warnings,
    session_id: (sessionRow as any).id,
  }
}

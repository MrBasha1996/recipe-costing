import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/batches/produce
 * ينتج كمية من باتش معيّن: يخصم المواد الخام ويضيف الباتش للمخزون.
 *
 * Body: { brand_id, batch_sku, qty_portions, dry_run?, note? }
 * dry_run=true → حساب فقط بدون كتابة في DB (للمعاينة)
 */
export async function POST(request: NextRequest) {
  const serverClient = await createClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { brand_id, batch_sku, qty_portions, dry_run = false, note: userNote, performed_by = null } =
    await request.json()

  if (!brand_id || !batch_sku || !qty_portions || qty_portions <= 0) {
    return NextResponse.json({ error: 'brand_id و batch_sku و qty_portions مطلوبة' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── 1. جلب الوصفة النشطة للباتش ──────────────────────────────────
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

  // ── 2. جلب مكونات الوصفة ──────────────────────────────────────────
  const { data: ings, error: ingErr } = await (admin.from('recipe_ingredients') as any)
    .select('ing_sku, ing_name, qty, yield_pct, unit, is_semi')
    .eq('recipe_id', recipe.id)

  if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 })
  if (!ings?.length) return NextResponse.json({ error: 'الوصفة لا تحتوي على مكونات' }, { status: 400 })

  // ── 2b. Fetch unit conversions (recipe_unit → buy_unit) ──────────
  const ingSkusForUC = (ings as any[]).map((i: any) => i.ing_sku)
  const { data: ucRows } = await (admin.from('unit_conversions') as any)
    .select('ing_sku, factor')
    .eq('brand_id', brand_id)
    .in('ing_sku', ingSkusForUC)
  const ucMap = new Map<string, number>()
  for (const uc of (ucRows || []) as any[]) ucMap.set(uc.ing_sku, uc.factor)

  // ── 3. حساب الاحتياجات ────────────────────────────────────────────
  // لكل مكون: needed in recipe_unit → divide by factor to get buy_unit
  type IngNeed = { sku: string; name: string; unit: string; needed: number; is_semi: boolean }
  const needs: IngNeed[] = []
  for (const ing of ings as any[]) {
    if ((ing.yield_pct ?? 0) <= 0) continue
    const factor = ucMap.get(ing.ing_sku) ?? 1
    const needed = ((ing.qty / (ing.yield_pct / 100)) / yieldPortions * qty_portions) / factor
    needs.push({ sku: ing.ing_sku, name: ing.ing_name, unit: ing.unit ?? '—', needed, is_semi: ing.is_semi })
  }

  // ── 4. تحقق من المخزون الحالي ─────────────────────────────────────
  const ingSkus = needs.map(n => n.sku)
  const { data: stockRows } = await (admin.from('stock_items') as any)
    .select('ing_sku, current_qty, min_qty, unit')
    .eq('brand_id', brand_id)
    .in('ing_sku', ingSkus)

  const stockMap = new Map<string, { current_qty: number; min_qty: number; unit: string }>()
  for (const s of (stockRows || []) as any[])
    stockMap.set(s.ing_sku, { current_qty: s.current_qty, min_qty: s.min_qty, unit: s.unit })

  // جلب مخزون الباتش نفسه
  const { data: batchStock } = await (admin.from('stock_items') as any)
    .select('current_qty, min_qty, unit, ing_name')
    .eq('brand_id', brand_id)
    .eq('ing_sku', batch_sku)
    .maybeSingle()

  // ── 5. بناء تقرير المعاينة ────────────────────────────────────────
  type IngReport = IngNeed & { in_stock: number; deficit: number; sufficient: boolean }
  const report: IngReport[] = needs.map(n => {
    const inStock = stockMap.get(n.sku)?.current_qty ?? 0
    const deficit = Math.max(0, n.needed - inStock)
    return { ...n, in_stock: inStock, deficit, sufficient: deficit === 0 }
  })

  const allSufficient = report.every(r => r.sufficient)

  if (dry_run) {
    return NextResponse.json({
      dry_run: true,
      batch_sku,
      batch_name: recipe.product_name,
      qty_portions,
      yield_portions: yieldPortions,
      ingredients: report,
      all_sufficient: allSufficient,
      cost_estimate: (recipe.total_cost / yieldPortions) * qty_portions,
      batch_current_stock: (batchStock as any)?.current_qty ?? 0,
    })
  }

  // ── 6. تنفيذ الإنتاج ─────────────────────────────────────────────
  const prodNote = userNote || `إنتاج باتش — ${recipe.product_name} × ${qty_portions}`
  const now = new Date().toISOString()

  // خصم المكونات من المخزون
  const deductUpserts: any[] = []
  const deductMovements: any[] = []

  for (const r of report) {
    const currentQty = stockMap.get(r.sku)?.current_qty ?? 0
    const newQty = Math.max(0, currentQty - r.needed)

    deductUpserts.push({
      brand_id, ing_sku: r.sku, ing_name: r.name, unit: r.unit,
      current_qty: newQty, min_qty: stockMap.get(r.sku)?.min_qty ?? 0,
      updated_at: now,
    })
    deductMovements.push({
      brand_id, ing_sku: r.sku, ing_name: r.name,
      movement_type: 'out',
      qty: Math.round(r.needed * 1000) / 1000,
      note: prodNote, performed_by,
    })
  }

  const { error: deductErr } = await (admin.from('stock_items') as any)
    .upsert(deductUpserts, { onConflict: 'brand_id,ing_sku' })
  if (deductErr) return NextResponse.json({ error: deductErr.message }, { status: 500 })

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

  return NextResponse.json({
    ok: true,
    batch_sku,
    batch_name: recipe.product_name,
    qty_produced: qty_portions,
    batch_new_stock: batchNewQty,
    ingredients_deducted: report.length,
    warnings: report.filter(r => !r.sufficient).map(r =>
      `${r.name}: احتجنا ${r.needed.toFixed(3)} ولكن في المخزون ${r.in_stock.toFixed(3)}`
    ),
  })
}

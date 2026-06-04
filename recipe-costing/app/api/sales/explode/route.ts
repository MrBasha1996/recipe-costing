import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/sales/explode
 * Recipe Explosion: deducts ingredients from stock_items based on sales.
 *
 * Body: { brand_id: string, import_batch: string }
 *
 * Algorithm:
 * 1. Fetch all sales for the batch, grouped by product_sku
 * 2. For each product, find its active recipe + ingredients
 * 3. Calculate gross quantity to deduct per ingredient:
 *    deduct = qty_sold × (ing.qty / (ing.yield_pct/100)) / recipe.yield_portions
 * 4. Aggregate deductions across all products (same ingredient may appear in multiple recipes)
 * 5. Upsert stock_items (reduce current_qty)
 * 6. Insert stock_movements for audit trail
 */
export async function POST(request: NextRequest) {
  const { brand_id, import_batch } = await request.json()
  if (!brand_id || !import_batch) {
    return NextResponse.json({ error: 'brand_id و import_batch مطلوبان' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── 1. Fetch sales for this batch grouped by product_sku ──────────
  const { data: sales, error: salesErr } = await (admin.from('daily_sales') as any)
    .select('product_sku, product_name, qty_sold')
    .eq('brand_id', brand_id)
    .eq('import_batch', import_batch)

  if (salesErr) return NextResponse.json({ error: salesErr.message }, { status: 500 })
  if (!sales?.length) return NextResponse.json({ exploded: 0, skipped: 0 })

  // Group by product_sku → sum qty_sold
  const saleMap = new Map<string, number>()
  for (const s of sales as any[]) {
    saleMap.set(s.product_sku, (saleMap.get(s.product_sku) ?? 0) + s.qty_sold)
  }

  const productSkus = [...saleMap.keys()]

  // ── 2. Fetch active recipes for all sold products ─────────────────
  const { data: recipes, error: recipeErr } = await (admin.from('recipes') as any)
    .select('id, sku, yield_portions')
    .eq('brand_id', brand_id)
    .eq('is_active', true)
    .in('sku', productSkus)

  if (recipeErr) return NextResponse.json({ error: recipeErr.message }, { status: 500 })

  const recipeMap = new Map<string, { id: string; yield_portions: number }>()
  for (const r of (recipes || []) as any[]) {
    recipeMap.set(r.sku, { id: r.id, yield_portions: r.yield_portions })
  }

  const recipeIds = (recipes || []).map((r: any) => r.id)
  if (!recipeIds.length) {
    return NextResponse.json({ exploded: 0, skipped: productSkus.length, note: 'لا توجد وصفات نشطة لهذه المنتجات' })
  }

  // ── 3. Fetch all recipe ingredients ──────────────────────────────
  const { data: ingredients, error: ingErr } = await (admin.from('recipe_ingredients') as any)
    .select('recipe_id, ing_sku, ing_name, qty, yield_pct, is_semi')
    .in('recipe_id', recipeIds)

  if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 })

  // ── 4. Aggregate deductions per ingredient ────────────────────────
  // deductMap: ing_sku → { ing_name, total_qty }
  const deductMap = new Map<string, { name: string; qty: number }>()
  let exploded = 0
  let skipped = 0

  for (const [productSku, qtySold] of saleMap) {
    const recipe = recipeMap.get(productSku)
    if (!recipe) { skipped++; continue }

    const recipeIngs = (ingredients || []).filter((i: any) => i.recipe_id === recipe.id)
    if (!recipeIngs.length) { skipped++; continue }

    exploded++
    for (const ing of recipeIngs as any[]) {
      if (ing.yield_pct <= 0) continue
      // Gross quantity from stock per portion × qty_sold
      const grossPerPortion = ing.qty / (ing.yield_pct / 100) / recipe.yield_portions
      const totalDeduct = grossPerPortion * qtySold

      const existing = deductMap.get(ing.ing_sku)
      if (existing) {
        existing.qty += totalDeduct
      } else {
        deductMap.set(ing.ing_sku, { name: ing.ing_name, qty: totalDeduct })
      }
    }
  }

  if (!deductMap.size) {
    return NextResponse.json({ exploded, skipped, note: 'لا توجد مكونات للخصم' })
  }

  // ── 5. Fetch current stock_items for the affected SKUs ────────────
  const affectedSkus = [...deductMap.keys()]
  const { data: stockRows } = await (admin.from('stock_items') as any)
    .select('id, ing_sku, current_qty, min_qty, unit')
    .eq('brand_id', brand_id)
    .in('ing_sku', affectedSkus)

  const stockMap = new Map<string, { id: string; current_qty: number; min_qty: number; unit: string }>()
  for (const s of (stockRows || []) as any[]) {
    stockMap.set(s.ing_sku, { id: s.id, current_qty: s.current_qty, min_qty: s.min_qty, unit: s.unit })
  }

  // ── 6. Upsert stock_items + insert movements ──────────────────────
  const upsertRows: any[] = []
  const movementRows: any[] = []
  const note = `خصم تلقائي — دفعة ${import_batch.slice(0, 8)}`

  for (const [sku, { name, qty }] of deductMap) {
    const stock = stockMap.get(sku)
    const currentQty = stock?.current_qty ?? 0
    const newQty = Math.max(0, currentQty - qty)

    upsertRows.push({
      brand_id,
      ing_sku:     sku,
      ing_name:    name,
      unit:        stock?.unit ?? '—',
      current_qty: newQty,
      min_qty:     stock?.min_qty ?? 0,
      updated_at:  new Date().toISOString(),
    })

    movementRows.push({
      brand_id,
      ing_sku:       sku,
      ing_name:      name,
      movement_type: 'out',
      qty:           Math.round(qty * 1000) / 1000,
      note,
      performed_by:  null,
    })
  }

  const { error: upsertErr } = await (admin.from('stock_items') as any)
    .upsert(upsertRows, { onConflict: 'brand_id,ing_sku' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  await (admin.from('stock_movements') as any).insert(movementRows)

  return NextResponse.json({
    ok: true,
    exploded,
    skipped,
    deducted: deductMap.size,
  })
}

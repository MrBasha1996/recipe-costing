import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBrandAccess, isAuthError } from '@/lib/auth'
import { executeBatchProduce } from '@/lib/produceBatch'

const BodySchema = z.object({
  brand_id:             z.string().min(1),
  import_batch:         z.string().uuid(),
  auto_produce_batches: z.boolean().optional().default(false),
  performed_by:         z.string().uuid().nullable().optional().default(null),
})

/**
 * POST /api/sales/explode
 * Recipe Explosion: deducts ingredients from stock_items based on sales.
 *
 * Body: { brand_id, import_batch, auto_produce_batches?, performed_by? }
 *
 * Algorithm:
 * 1. Fetch all sales for the batch
 * 2. For each product, find its active+approved recipe + ingredients
 * 2b. For products without a recipe → check combo_meals (expand to component recipes)
 * 3. Aggregate deductions across all products (regular + combo)
 * 4. Upsert stock_items (reduce current_qty)
 * 5. Insert stock_movements for audit trail
 * 6. Write cost per sale record
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

  const { brand_id, import_batch, auto_produce_batches, performed_by } = parsed.data
  const admin = createAdminClient()

  // ── 1. Fetch sales for this batch ─────────────────────────────────
  const { data: sales, error: salesErr } = await (admin.from('daily_sales') as any)
    .select('id, product_sku, product_name, qty_sold')
    .eq('brand_id', brand_id)
    .eq('import_batch', import_batch)

  if (salesErr) return NextResponse.json({ error: salesErr.message }, { status: 500 })
  if (!sales?.length) return NextResponse.json({ exploded: 0, skipped: 0 })

  const saleMap = new Map<string, number>()
  for (const s of sales as any[]) {
    saleMap.set(s.product_sku, (saleMap.get(s.product_sku) ?? 0) + s.qty_sold)
  }

  const productSkus = [...saleMap.keys()]

  // ── 2. Fetch active + approved recipes for all sold products ───────
  const { data: recipes, error: recipeErr } = await (admin.from('recipes') as any)
    .select('id, sku, yield_portions, total_cost')
    .eq('brand_id', brand_id)
    .eq('is_active', true)
    .eq('is_approved', true)
    .in('sku', productSkus)

  if (recipeErr) return NextResponse.json({ error: recipeErr.message }, { status: 500 })

  const recipeMap = new Map<string, { id: string; yield_portions: number; total_cost: number }>()
  for (const r of (recipes || []) as any[]) {
    recipeMap.set(r.sku, {
      id: r.id,
      yield_portions: Math.max(r.yield_portions, 1),
      total_cost: r.total_cost ?? 0,
    })
  }

  // ── 3. Fetch recipe ingredients ────────────────────────────────────
  const recipeIds = (recipes || []).map((r: any) => r.id)

  const { data: ingredients, error: ingErr } = recipeIds.length > 0
    ? await (admin.from('recipe_ingredients') as any)
        .select('recipe_id, ing_sku, ing_name, qty, yield_pct, is_semi')
        .in('recipe_id', recipeIds)
    : { data: [], error: null }

  if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 })

  // ── 3b. Unit conversions ───────────────────────────────────────────
  const allIngSkus = [...new Set((ingredients || []).map((i: any) => i.ing_sku))]
  const { data: ucRows } = allIngSkus.length > 0
    ? await (admin.from('unit_conversions') as any)
        .select('ing_sku, factor')
        .eq('brand_id', brand_id)
        .in('ing_sku', allIngSkus)
    : { data: [] }
  const ucMap = new Map<string, number>()
  for (const uc of (ucRows || []) as any[]) ucMap.set(uc.ing_sku, uc.factor)

  // ── 4. Aggregate deductions — regular products ─────────────────────
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
      const grossPerPortion = ing.qty / (ing.yield_pct / 100) / recipe.yield_portions
      const factor = ucMap.get(ing.ing_sku) ?? 1
      const totalDeduct = (grossPerPortion * qtySold) / factor

      const existing = deductMap.get(ing.ing_sku)
      if (existing) existing.qty += totalDeduct
      else deductMap.set(ing.ing_sku, { name: ing.ing_name, qty: totalDeduct })
    }
  }

  // ── 4b. Combo meal expansion ───────────────────────────────────────
  // لكل SKU لم تُوجد له وصفة → نفحص إذا كان وجبة كومبو نشطة.
  // نوسّع الكومبو إلى وصفات عناصره، ونجمع خصومات المواد الخام.
  const comboMap = new Map<string, { total_cost: number }>()

  const missingSkus = productSkus.filter(sku => !recipeMap.has(sku))
  if (missingSkus.length > 0) {
    const { data: combos } = await (admin.from('combo_meals') as any)
      .select('sku, total_cost, combo_meal_items(product_sku, qty)')
      .eq('brand_id', brand_id)
      .eq('is_active', true)
      .in('sku', missingSkus)

    if ((combos as any[])?.length) {
      // جلب وصفات عناصر الكومبو (معتمدة + نشطة)
      const compSkus = [...new Set((combos as any[]).flatMap((c: any) =>
        (c.combo_meal_items || []).map((i: any) => i.product_sku)
      ))]

      const { data: compRecipes } = await (admin.from('recipes') as any)
        .select('id, sku, yield_portions')
        .eq('brand_id', brand_id)
        .eq('is_active', true)
        .eq('is_approved', true)
        .in('sku', compSkus)

      const compRecipeMap = new Map<string, { id: string; yield_portions: number }>()
      for (const r of (compRecipes || []) as any[])
        compRecipeMap.set(r.sku, { id: r.id, yield_portions: Math.max(r.yield_portions, 1) })

      const compRecipeIds = [...compRecipeMap.values()].map(r => r.id)

      if (compRecipeIds.length > 0) {
        const { data: compIngs } = await (admin.from('recipe_ingredients') as any)
          .select('recipe_id, ing_sku, ing_name, qty, yield_pct')
          .in('recipe_id', compRecipeIds)

        // توسيع ucMap بأي مكونات جديدة من الكومبو
        const newIngSkus = [...new Set((compIngs || []).map((i: any) => i.ing_sku))]
          .filter(s => !ucMap.has(s))
        if (newIngSkus.length > 0) {
          const { data: newUcRows } = await (admin.from('unit_conversions') as any)
            .select('ing_sku, factor')
            .eq('brand_id', brand_id)
            .in('ing_sku', newIngSkus)
          for (const uc of (newUcRows || []) as any[]) ucMap.set(uc.ing_sku, uc.factor)
        }

        const compIngsByRecipeId = new Map<string, any[]>()
        for (const ing of (compIngs || []) as any[]) {
          if (!compIngsByRecipeId.has(ing.recipe_id)) compIngsByRecipeId.set(ing.recipe_id, [])
          compIngsByRecipeId.get(ing.recipe_id)!.push(ing)
        }

        for (const combo of (combos as any[])) {
          const qtySold = saleMap.get(combo.sku) ?? 0
          if (!qtySold) continue

          let comboHasIngs = false
          for (const item of (combo.combo_meal_items || []) as any[]) {
            const compRecipe = compRecipeMap.get(item.product_sku)
            if (!compRecipe) continue

            const ings = compIngsByRecipeId.get(compRecipe.id) ?? []
            for (const ing of ings) {
              if ((ing.yield_pct ?? 0) <= 0) continue
              comboHasIngs = true
              const factor = ucMap.get(ing.ing_sku) ?? 1
              const needed = ((ing.qty / (ing.yield_pct / 100)) / compRecipe.yield_portions * (item.qty ?? 1) * qtySold) / factor
              const existing = deductMap.get(ing.ing_sku)
              if (existing) existing.qty += needed
              else deductMap.set(ing.ing_sku, { name: ing.ing_name, qty: needed })
            }
          }

          if (comboHasIngs) {
            comboMap.set(combo.sku, { total_cost: combo.total_cost ?? 0 })
            exploded++
            skipped--
          }
        }
      }
    }
  }

  if (!deductMap.size) {
    return NextResponse.json({ exploded, skipped, note: 'لا توجد مكونات للخصم' })
  }

  // ── 5. auto_produce: إنتاج الباتشات الناقصة قبل الخصم ───────────
  const produced_batches: { sku: string; name: string; qty: number }[] = []

  if (auto_produce_batches) {
    const batchIngSkus = new Set<string>()
    for (const ing of (ingredients || []) as any[]) {
      if (ing.is_semi) batchIngSkus.add(ing.ing_sku)
    }

    if (batchIngSkus.size > 0) {
      const { data: batchStocks } = await (admin.from('stock_items') as any)
        .select('ing_sku, current_qty')
        .eq('brand_id', brand_id)
        .in('ing_sku', [...batchIngSkus])

      const batchStockMap = new Map<string, number>()
      for (const s of (batchStocks || []) as any[]) batchStockMap.set(s.ing_sku, s.current_qty)

      for (const [bSku, info] of deductMap) {
        if (!batchIngSkus.has(bSku)) continue
        const inStock = batchStockMap.get(bSku) ?? 0
        const deficit = info.qty - inStock
        if (deficit <= 0) continue

        const result = await executeBatchProduce(admin, {
          brand_id,
          batch_sku: bSku,
          qty_portions: deficit,
          performed_by: performed_by ?? null,
          note: `إنتاج تلقائي — دفعة ${import_batch.slice(0, 8)}`,
        })

        if ('ok' in result) {
          produced_batches.push({ sku: bSku, name: info.name, qty: deficit })
        }
      }
    }
  }

  // ── 6. Fetch current stock_items for the affected SKUs ────────────
  const affectedSkus = [...deductMap.keys()]
  const { data: stockRows } = await (admin.from('stock_items') as any)
    .select('id, ing_sku, current_qty, min_qty, unit')
    .eq('brand_id', brand_id)
    .in('ing_sku', affectedSkus)

  const stockMap = new Map<string, { id: string; current_qty: number; min_qty: number; unit: string }>()
  for (const s of (stockRows || []) as any[]) {
    stockMap.set(s.ing_sku, { id: s.id, current_qty: s.current_qty, min_qty: s.min_qty, unit: s.unit })
  }

  // ── 7. Upsert stock_items + insert movements ──────────────────────
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
      performed_by: performed_by ?? null,
    })
  }

  const { error: upsertErr } = await (admin.from('stock_items') as any)
    .upsert(upsertRows, { onConflict: 'brand_id,ing_sku' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  await (admin.from('stock_movements') as any).insert(movementRows)

  await (admin.from('daily_sales') as any)
    .update({ exploded_at: new Date().toISOString() })
    .eq('brand_id', brand_id)
    .eq('import_batch', import_batch)

  // ── 8. حساب وحفظ التكلفة لكل سجل مبيعات ─────────────────────────
  // المنتجات العادية: cost = (total_cost / yield_portions) * qty_sold
  // الكومبو:         cost = combo.total_cost * qty_sold
  // سجلات بلا وصفة معتمدة أو كومبو → cost يبقى NULL
  for (const row of (sales as any[])) {
    const recipe = recipeMap.get(row.product_sku)
    if (recipe) {
      const cost = Math.round((recipe.total_cost / recipe.yield_portions) * row.qty_sold * 10000) / 10000
      await (admin.from('daily_sales') as any).update({ cost }).eq('id', row.id)
      continue
    }
    const combo = comboMap.get(row.product_sku)
    if (combo) {
      const cost = Math.round(combo.total_cost * row.qty_sold * 10000) / 10000
      await (admin.from('daily_sales') as any).update({ cost }).eq('id', row.id)
    }
  }

  return NextResponse.json({
    ok: true,
    exploded,
    skipped,
    deducted: deductMap.size,
    produced_batches,
  })
}

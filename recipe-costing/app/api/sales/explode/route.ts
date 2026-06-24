import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModulePermission, isAuthError } from '@/lib/auth'
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

  const user = await requireModulePermission(parsed.data.brand_id, 'sales', 'update')
  if (isAuthError(user)) return user

  const { brand_id, import_batch, auto_produce_batches, performed_by } = parsed.data
  const admin = createAdminClient()

  // ── 0. Period close guard ─────────────────────────────────────────
  const { data: brandRow } = await (admin.from('brands') as any)
    .select('closed_up_to').eq('id', brand_id).maybeSingle()
  if (brandRow?.closed_up_to) {
    const { data: earliestRow } = await (admin.from('daily_sales') as any)
      .select('sale_date').eq('brand_id', brand_id).eq('import_batch', import_batch)
      .order('sale_date', { ascending: true }).limit(1).maybeSingle()
    if (earliestRow?.sale_date) {
      const batchYM = (earliestRow.sale_date as string).slice(0, 7)
      if (batchYM <= brandRow.closed_up_to) {
        return NextResponse.json(
          { error: `الفترة ${batchYM} مُغلقة — لا يمكن تطبيق مبيعات بتاريخ مُغلق` },
          { status: 423 }
        )
      }
    }
  }

  // ── 1. Fetch sales for this batch ─────────────────────────────────
  const { data: sales, error: salesErr } = await (admin.from('daily_sales') as any)
    .select('id, product_sku, product_name, qty_sold, sale_date')
    .eq('brand_id', brand_id)
    .eq('import_batch', import_batch)
    .is('exploded_at', null)

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
  const modifierSalesIds: string[] = []
  const modSemiSkus = new Set<string>()

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
        const newIngSkus = [...new Set<string>((compIngs || []).map((i: any) => i.ing_sku as string))]
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
            skipped = Math.max(0, skipped - 1)
          }
        }
      }
    }
  }

  // ── 4c. Modifier ingredient deductions ────────────────────────────
  // Fetch modifier_sales for exactly this import_batch — prevents deducting a modifier batch
  // when exploding a different daily_sales batch in the same period
  const { data: modSales } = await (admin.from('modifier_sales') as any)
    .select('id, option_sku, qty_sold')
    .eq('brand_id', brand_id)
    .eq('import_batch', import_batch)
    .is('exploded_at', null)

  {
    const modSalesList = (modSales || []) as any[]
    if (modSalesList.length > 0) {
      for (const r of modSalesList) modifierSalesIds.push(r.id)
      const optionSkus = [...new Set(modSalesList.map((r: any) => r.option_sku as string))]

      const { data: modOptions } = await (admin.from('modifier_options') as any)
        .select('id, option_sku')
        .eq('brand_id', brand_id)
        .in('option_sku', optionSkus)

      const optionSkuToId = new Map<string, string>()
      for (const opt of (modOptions || []) as any[]) optionSkuToId.set(opt.option_sku, opt.id)

      const optionIds = [...optionSkuToId.values()]
      if (optionIds.length > 0) {
        const { data: modIngs } = await (admin.from('modifier_option_ingredients') as any)
          .select('option_id, ing_sku, ing_name, qty, yield_pct')
          .in('option_id', optionIds)

        const ingsByOptionId = new Map<string, any[]>()
        for (const ing of (modIngs || []) as any[]) {
          if (!ingsByOptionId.has(ing.option_id)) ingsByOptionId.set(ing.option_id, [])
          ingsByOptionId.get(ing.option_id)!.push(ing)
        }

        // Extend ucMap for any new modifier ingredient SKUs
        const newModIngSkus = ([...new Set((modIngs || []).map((i: any) => i.ing_sku as string))] as string[])
          .filter(s => !ucMap.has(s))
        if (newModIngSkus.length > 0) {
          const { data: modUcRows } = await (admin.from('unit_conversions') as any)
            .select('ing_sku, factor').eq('brand_id', brand_id).in('ing_sku', newModIngSkus)
          for (const uc of (modUcRows || []) as any[]) ucMap.set(uc.ing_sku, uc.factor)
        }

        // Identify semi-products among modifier ingredients (for auto_produce in step 5)
        const allModIngSkus = [...new Set((modIngs || []).map((i: any) => i.ing_sku as string))]
        if (allModIngSkus.length > 0) {
          const { data: semiProds } = await (admin.from('products') as any)
            .select('sku').eq('brand_id', brand_id).eq('is_semi', true).in('sku', allModIngSkus)
          for (const p of (semiProds || []) as any[]) modSemiSkus.add(p.sku)
        }

        for (const sale of modSalesList) {
          const optId = optionSkuToId.get(sale.option_sku)
          if (!optId) continue
          const ings = ingsByOptionId.get(optId) ?? []
          for (const ing of ings as any[]) {
            if ((ing.yield_pct ?? 0) <= 0) continue
            const factor  = ucMap.get(ing.ing_sku) ?? 1
            const needed  = ((ing.qty / (ing.yield_pct / 100)) * sale.qty_sold) / factor
            const existing = deductMap.get(ing.ing_sku)
            if (existing) existing.qty += needed
            else deductMap.set(ing.ing_sku, { name: ing.ing_name, qty: needed })
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
    for (const sku of modSemiSkus) batchIngSkus.add(sku)

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

  // ── 7. Build write payloads ───────────────────────────────────────
  const stockUpserts: any[] = []
  const movementRows: any[] = []
  const deficits: { sku: string; name: string; needed: number; inStock: number }[] = []
  const note = `خصم تلقائي — دفعة ${import_batch.slice(0, 8)}`

  for (const [sku, { name, qty }] of deductMap) {
    const stock = stockMap.get(sku)
    const inStock = stock?.current_qty ?? 0
    if (qty > inStock) {
      deficits.push({ sku, name, needed: Math.round(qty * 1000) / 1000, inStock })
    }
    stockUpserts.push({
      ing_sku:     sku,
      ing_name:    name,
      unit:        stock?.unit ?? '—',
      current_qty: Math.max(0, inStock - qty),
      min_qty:     stock?.min_qty ?? 0,
    })
    movementRows.push({
      ing_sku:      sku,
      ing_name:     name,
      qty:          Math.round(qty * 1000) / 1000,
      note,
      performed_by: performed_by ?? '',
    })
  }

  // ── 8. Build per-sale cost payload ────────────────────────────────
  const saleCosts: any[] = []
  for (const row of (sales as any[])) {
    const recipe = recipeMap.get(row.product_sku)
    if (recipe) {
      saleCosts.push({ id: row.id, cost: Math.round((recipe.total_cost / recipe.yield_portions) * row.qty_sold * 10000) / 10000 })
      continue
    }
    const combo = comboMap.get(row.product_sku)
    if (combo) {
      saleCosts.push({ id: row.id, cost: Math.round(combo.total_cost * row.qty_sold * 10000) / 10000 })
    }
  }

  // ── 9. Atomic write via RPC ───────────────────────────────────────
  const { error: rpcErr } = await (admin as any).rpc('apply_explode_writes', {
    p_brand_id:           brand_id,
    p_import_batch:       import_batch,
    p_stock_upserts:      stockUpserts,
    p_movements:          movementRows,
    p_sale_costs:         saleCosts,
    p_modifier_sales_ids: modifierSalesIds.length > 0 ? modifierSalesIds : null,
  })

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  await (admin.from('audit_logs') as any).insert({
    brand_id,
    action:       'sales_exploded',
    entity_type:  'sale_batch',
    entity_sku:   import_batch,
    performed_by: (user as any).id,
    metadata: { exploded, skipped, deducted: deductMap.size },
  })

  return NextResponse.json({
    ok: true,
    exploded,
    skipped,
    deducted: deductMap.size,
    produced_batches,
    ...(deficits.length > 0 ? { deficits } : {}),
  })
}

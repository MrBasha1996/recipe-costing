import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBrandAccess, isAuthError } from '@/lib/auth'

const BodySchema = z.object({
  brand_id:     z.string().min(1),
  import_batch: z.string().uuid(),
})

/**
 * POST /api/sales/explode-check
 * تحليل دفعة مبيعات بدون كتابة: يكشف المنتجات بلا وصفة،
 * الباتشات الناقصة، والمواد الخام الغير كافية.
 * يدعم الكومبو: يوسّعها إلى وصفات عناصرها ويحسب احتياجاتها.
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

  const { brand_id, import_batch } = parsed.data
  const admin = createAdminClient()

  // ── 1. تجميع المبيعات ─────────────────────────────────────────────
  const { data: sales, error: salesErr } = await (admin.from('daily_sales') as any)
    .select('product_sku, product_name, qty_sold')
    .eq('brand_id', brand_id)
    .eq('import_batch', import_batch)

  if (salesErr) return NextResponse.json({ error: salesErr.message }, { status: 500 })
  if (!sales?.length) return NextResponse.json({ error: 'لا توجد مبيعات لهذه الدفعة' }, { status: 404 })

  const saleMap = new Map<string, { name: string; qty: number }>()
  for (const s of sales as any[]) {
    const ex = saleMap.get(s.product_sku)
    if (ex) ex.qty += s.qty_sold
    else saleMap.set(s.product_sku, { name: s.product_name, qty: s.qty_sold })
  }

  const productSkus = [...saleMap.keys()]

  // ── 2. جلب الوصفات المعتمدة النشطة ───────────────────────────────
  const { data: recipes } = await (admin.from('recipes') as any)
    .select('id, sku, yield_portions')
    .eq('brand_id', brand_id)
    .eq('is_active', true)
    .eq('is_approved', true)
    .in('sku', productSkus)

  const recipeMap = new Map<string, { id: string; yield_portions: number }>()
  for (const r of (recipes || []) as any[])
    recipeMap.set(r.sku, { id: r.id, yield_portions: Math.max(r.yield_portions, 1) })

  // ── 2b. توسيع الكومبو للـ SKUs بلا وصفة ─────────────────────────
  // comboExpansion: بيانات جاهزة لحساب احتياجات الكومبو في خطوة 4
  type ComboExpansion = {
    comboSku: string
    qtySold: number
    items: Array<{
      product_sku: string
      qty: number
      recipe: { id: string; yield_portions: number } | undefined
    }>
    compIngsByRecipeId: Map<string, any[]>
  }

  const comboExpansions: ComboExpansion[] = []
  const resolvedComboSkus = new Set<string>()

  const missingFromRecipes = productSkus.filter(sku => !recipeMap.has(sku))
  if (missingFromRecipes.length > 0) {
    const { data: combos } = await (admin.from('combo_meals') as any)
      .select('sku, combo_meal_items(product_sku, qty)')
      .eq('brand_id', brand_id)
      .eq('is_active', true)
      .in('sku', missingFromRecipes)

    if ((combos as any[])?.length) {
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

      let compIngsByRecipeId = new Map<string, any[]>()
      if (compRecipeIds.length > 0) {
        const { data: compIngs } = await (admin.from('recipe_ingredients') as any)
          .select('recipe_id, ing_sku, ing_name, qty, yield_pct, unit, is_semi')
          .in('recipe_id', compRecipeIds)

        for (const ing of (compIngs || []) as any[]) {
          if (!compIngsByRecipeId.has(ing.recipe_id)) compIngsByRecipeId.set(ing.recipe_id, [])
          compIngsByRecipeId.get(ing.recipe_id)!.push(ing)
        }
      }

      for (const combo of (combos as any[])) {
        const sale = saleMap.get(combo.sku)
        if (!sale) continue

        const items = (combo.combo_meal_items || []).map((item: any) => ({
          product_sku: item.product_sku,
          qty: item.qty ?? 1,
          recipe: compRecipeMap.get(item.product_sku),
        }))

        // الكومبو قابل للتوسيع فقط إذا كان على الأقل عنصر واحد له وصفة
        if (items.some((i: any) => i.recipe)) {
          resolvedComboSkus.add(combo.sku)
          comboExpansions.push({
            comboSku: combo.sku,
            qtySold: sale.qty,
            items,
            compIngsByRecipeId,
          })
        }
      }
    }
  }

  // missing_recipes = SKUs لا وصفة لها ولا كومبو قابل للتوسيع
  const missing_recipes = productSkus
    .filter(sku => !recipeMap.has(sku) && !resolvedComboSkus.has(sku))
    .map(sku => ({ sku, name: saleMap.get(sku)?.name ?? sku }))

  // ── 3. جلب المكونات للوصفات العادية ──────────────────────────────
  const recipeIds = [...recipeMap.values()].map(r => r.id)

  const { data: ings } = recipeIds.length > 0
    ? await (admin.from('recipe_ingredients') as any)
        .select('recipe_id, ing_sku, ing_name, qty, yield_pct, unit, is_semi')
        .in('recipe_id', recipeIds)
    : { data: [] }

  // ── 4. تجميع الاحتياجات (عادية + كومبو) ─────────────────────────
  const rawNeeds  = new Map<string, { name: string; unit: string; needed: number }>()
  const batchNeeds = new Map<string, { name: string; unit: string; needed: number }>()

  const addNeed = (ing: any, needed: number) => {
    const target = ing.is_semi ? batchNeeds : rawNeeds
    const ex = target.get(ing.ing_sku)
    if (ex) ex.needed += needed
    else target.set(ing.ing_sku, { name: ing.ing_name, unit: ing.unit ?? '—', needed })
  }

  // المنتجات العادية
  for (const [productSku, sale] of saleMap) {
    const recipe = recipeMap.get(productSku)
    if (!recipe) continue
    const recipeIngs = (ings || []).filter((i: any) => i.recipe_id === recipe.id)
    for (const ing of recipeIngs as any[]) {
      if ((ing.yield_pct ?? 0) <= 0) continue
      const needed = (ing.qty / (ing.yield_pct / 100)) / recipe.yield_portions * sale.qty
      addNeed(ing, needed)
    }
  }

  // الكومبو
  for (const expansion of comboExpansions) {
    for (const item of expansion.items) {
      if (!item.recipe) continue
      const itemIngs = expansion.compIngsByRecipeId.get(item.recipe.id) ?? []
      for (const ing of itemIngs as any[]) {
        if ((ing.yield_pct ?? 0) <= 0) continue
        const needed = (ing.qty / (ing.yield_pct / 100)) / item.recipe.yield_portions * item.qty * expansion.qtySold
        addNeed(ing, needed)
      }
    }
  }

  // ── 5. فحص مخزون الباتشات والخام ─────────────────────────────────
  const allCheckSkus = [...rawNeeds.keys(), ...batchNeeds.keys()]
  const { data: stockRows } = allCheckSkus.length > 0
    ? await (admin.from('stock_items') as any)
        .select('ing_sku, current_qty, unit')
        .eq('brand_id', brand_id)
        .in('ing_sku', allCheckSkus)
    : { data: [] }

  const stockMap = new Map<string, number>()
  for (const s of (stockRows || []) as any[]) stockMap.set(s.ing_sku, s.current_qty)

  const batchSkus = [...batchNeeds.keys()]
  const producibleBatches = new Set<string>()
  if (batchSkus.length) {
    const { data: batchRecipes } = await (admin.from('recipes') as any)
      .select('sku')
      .eq('brand_id', brand_id)
      .eq('is_active', true)
      .eq('is_approved', true)
      .in('sku', batchSkus)
    for (const r of (batchRecipes || []) as any[]) producibleBatches.add(r.sku)
  }

  const batches_to_produce = [...batchNeeds.entries()].map(([sku, info]) => {
    const in_stock = stockMap.get(sku) ?? 0
    const deficit  = Math.max(0, info.needed - in_stock)
    return {
      sku, name: info.name, unit: info.unit,
      needed: Math.round(info.needed * 1000) / 1000,
      in_stock: Math.round(in_stock * 1000) / 1000,
      deficit: Math.round(deficit * 1000) / 1000,
      has_recipe: producibleBatches.has(sku),
      needs_production: deficit > 0,
    }
  })

  const low_ingredients = [...rawNeeds.entries()]
    .map(([sku, info]) => {
      const in_stock = stockMap.get(sku) ?? 0
      const deficit  = Math.max(0, info.needed - in_stock)
      return {
        sku, name: info.name, unit: info.unit,
        needed: Math.round(info.needed * 1000) / 1000,
        in_stock: Math.round(in_stock * 1000) / 1000,
        deficit: Math.round(deficit * 1000) / 1000,
      }
    })
    .filter(r => r.deficit > 0)

  const ready_skus = productSkus.filter(sku => recipeMap.has(sku) || resolvedComboSkus.has(sku)).length
  const blocking_batches = batches_to_produce.filter(b => b.needs_production && !b.has_recipe)

  return NextResponse.json({
    total_products: productSkus.length,
    missing_recipes,
    batches_to_produce,
    low_ingredients,
    ready_skus,
    can_proceed: ready_skus > 0,
    blocking: blocking_batches.length > 0,
    blocking_reason: blocking_batches.length > 0
      ? `${blocking_batches.length} باتش ناقص وليس له وصفة نشطة للإنتاج: ${blocking_batches.map(b => b.name).join('، ')}`
      : null,
  })
}

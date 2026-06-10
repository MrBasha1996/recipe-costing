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

  // ── 2. جلب الوصفات النشطة ─────────────────────────────────────────
  const { data: recipes } = await (admin.from('recipes') as any)
    .select('id, sku, yield_portions')
    .eq('brand_id', brand_id)
    .eq('is_active', true)
    .in('sku', productSkus)

  const recipeMap = new Map<string, { id: string; yield_portions: number }>()
  for (const r of (recipes || []) as any[])
    recipeMap.set(r.sku, { id: r.id, yield_portions: Math.max(r.yield_portions, 1) })

  const missing_recipes = productSkus
    .filter(sku => !recipeMap.has(sku))
    .map(sku => ({ sku, name: saleMap.get(sku)?.name ?? sku }))

  // ── 3. جلب المكونات ───────────────────────────────────────────────
  const recipeIds = [...recipeMap.values()].map(r => r.id)
  if (!recipeIds.length) {
    return NextResponse.json({
      missing_recipes,
      batches_to_produce: [],
      low_ingredients: [],
      ready_skus: 0,
      can_proceed: false,
    })
  }

  const { data: ings } = await (admin.from('recipe_ingredients') as any)
    .select('recipe_id, ing_sku, ing_name, qty, yield_pct, unit, is_semi')
    .in('recipe_id', recipeIds)

  // ── 4. تجميع الاحتياجات ──────────────────────────────────────────
  const rawNeeds  = new Map<string, { name: string; unit: string; needed: number }>()
  const batchNeeds = new Map<string, { name: string; unit: string; needed: number }>()

  for (const [productSku, sale] of saleMap) {
    const recipe = recipeMap.get(productSku)
    if (!recipe) continue
    const recipeIngs = (ings || []).filter((i: any) => i.recipe_id === recipe.id)
    for (const ing of recipeIngs as any[]) {
      if ((ing.yield_pct ?? 0) <= 0) continue
      const needed = (ing.qty / (ing.yield_pct / 100)) / recipe.yield_portions * sale.qty

      if (ing.is_semi) {
        const ex = batchNeeds.get(ing.ing_sku)
        if (ex) ex.needed += needed
        else batchNeeds.set(ing.ing_sku, { name: ing.ing_name, unit: ing.unit ?? '—', needed })
      } else {
        const ex = rawNeeds.get(ing.ing_sku)
        if (ex) ex.needed += needed
        else rawNeeds.set(ing.ing_sku, { name: ing.ing_name, unit: ing.unit ?? '—', needed })
      }
    }
  }

  // ── 5. فحص مخزون الباتشات والخام ─────────────────────────────────
  const allCheckSkus = [...rawNeeds.keys(), ...batchNeeds.keys()]
  const { data: stockRows } = await (admin.from('stock_items') as any)
    .select('ing_sku, current_qty, unit')
    .eq('brand_id', brand_id)
    .in('ing_sku', allCheckSkus)

  const stockMap = new Map<string, number>()
  for (const s of (stockRows || []) as any[]) stockMap.set(s.ing_sku, s.current_qty)

  const batchSkus = [...batchNeeds.keys()]
  let producibleBatches = new Set<string>()
  if (batchSkus.length) {
    const { data: batchRecipes } = await (admin.from('recipes') as any)
      .select('sku')
      .eq('brand_id', brand_id)
      .eq('is_active', true)
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

  const ready_skus = productSkus.filter(sku => recipeMap.has(sku)).length
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

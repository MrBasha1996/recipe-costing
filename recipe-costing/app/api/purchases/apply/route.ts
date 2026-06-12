import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBrandAccess, isAuthError } from '@/lib/auth'

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

  const user = await requireBrandAccess(parsed.data.brand_id)
  if (isAuthError(user)) return user

  const { brand_id, import_batch, performed_by } = parsed.data

  const admin = createAdminClient()

  // ── 1. Fetch all purchases for this batch with ing_sku ────────────
  const { data: purchases, error: pErr } = await (admin.from('purchases') as any)
    .select('ing_sku, ing_name, qty, unit, unit_cost')
    .eq('brand_id', brand_id)
    .eq('import_batch', import_batch)
    .not('ing_sku', 'is', null)
    .gt('unit_cost', 0)

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!purchases?.length) return NextResponse.json({ updated: 0 })

  // Aggregate purchases per SKU (same ingredient may appear multiple times)
  const purchaseMap = new Map<string, { name: string; qty: number; total_value: number; unit: string }>()
  for (const p of purchases as any[]) {
    const existing = purchaseMap.get(p.ing_sku)
    if (existing) {
      existing.qty += p.qty
      existing.total_value += p.qty * p.unit_cost
    } else {
      purchaseMap.set(p.ing_sku, {
        name: p.ing_name,
        qty: p.qty,
        total_value: p.qty * p.unit_cost,
        unit: p.unit,
      })
    }
  }

  const skus = [...purchaseMap.keys()]

  // ── 2. Fetch current stock quantities ─────────────────────────────
  const { data: stockRows } = await (admin.from('stock_items') as any)
    .select('ing_sku, current_qty, min_qty')
    .eq('brand_id', brand_id)
    .in('ing_sku', skus)

  const stockMap = new Map<string, { qty: number; min_qty: number }>()
  for (const s of (stockRows || []) as any[]) {
    stockMap.set(s.ing_sku, { qty: s.current_qty ?? 0, min_qty: s.min_qty ?? 0 })
  }

  // ── 3. Fetch current ingredient costs ────────────────────────────
  const { data: ingRows } = await (admin.from('ingredients') as any)
    .select('sku, name, cost')
    .eq('brand_id', brand_id)
    .in('sku', skus)

  const costMap = new Map<string, { name: string; cost: number }>()
  for (const i of (ingRows || []) as any[]) {
    costMap.set(i.sku, { name: i.name, cost: i.cost ?? 0 })
  }

  // ── 4. Calculate WAC and prepare updates ─────────────────────────
  const ingredientUpdates: { sku: string; newCost: number }[] = []
  const priceHistoryRows: any[] = []
  const stockUpserts: any[] = []
  const now = new Date().toISOString()

  for (const [sku, purchase] of purchaseMap) {
    const currentStock = stockMap.get(sku)?.qty ?? 0
    const currentCost = costMap.get(sku)?.cost ?? 0
    const ingName = costMap.get(sku)?.name ?? purchase.name
    const purchaseUnitCost = purchase.total_value / purchase.qty

    // WAC formula
    const newCost = currentStock > 0
      ? (currentStock * currentCost + purchase.qty * purchaseUnitCost) / (currentStock + purchase.qty)
      : purchaseUnitCost

    const roundedNewCost = Math.round(newCost * 10000) / 10000

    // Only update if cost actually changed
    if (Math.abs(roundedNewCost - currentCost) > 0.0001) {
      ingredientUpdates.push({ sku, newCost: roundedNewCost })

      priceHistoryRows.push({
        brand_id,
        sku,
        item_name: ingName,
        item_type: 'ingredient',
        old_price: currentCost,
        new_price: roundedNewCost,
        changed_by: performed_by ?? null,
        changed_at: now,
      })
    }

    // Always upsert stock_items (add purchased quantity)
    stockUpserts.push({
      brand_id,
      ing_sku: sku,
      ing_name: ingName,
      unit: purchase.unit,
      current_qty: Math.max(0, currentStock) + purchase.qty,
      min_qty: stockMap.get(sku)?.min_qty ?? 0,
      updated_at: now,
    })
  }

  // ── 5. Apply updates ──────────────────────────────────────────────

  // Update ingredient costs (one at a time — no bulk update in PostgREST)
  for (const { sku, newCost } of ingredientUpdates) {
    await (admin.from('ingredients') as any)
      .update({ cost: newCost })
      .eq('sku', sku)
      .eq('brand_id', brand_id)
  }

  // Record price history
  if (priceHistoryRows.length > 0) {
    await (admin.from('price_history') as any).insert(priceHistoryRows)
  }

  // Upsert stock quantities
  if (stockUpserts.length > 0) {
    await (admin.from('stock_items') as any)
      .upsert(stockUpserts, { onConflict: 'brand_id,ing_sku' })
  }

  // ── 6. Cascade: recalculate recipe costs for affected recipes ────────
  let recipesUpdated = 0
  if (ingredientUpdates.length > 0) {
    const changedSkus = ingredientUpdates.map(u => u.sku)

    // Find recipe_ids that use any of the changed ingredients
    const { data: affected } = await (admin.from('recipe_ingredients') as any)
      .select('recipe_id')
      .eq('brand_id', brand_id)
      .in('ing_sku', changedSkus)

    const recipeIds = [...new Set((affected || []).map((r: any) => r.recipe_id as string))]

    if (recipeIds.length > 0) {
      // Update unit_cost snapshots in recipe_ingredients for changed SKUs
      for (const { sku, newCost } of ingredientUpdates) {
        await (admin.from('recipe_ingredients') as any)
          .update({ unit_cost: newCost })
          .eq('brand_id', brand_id)
          .eq('ing_sku', sku)
          .in('recipe_id', recipeIds)
      }

      // Fetch all recipe_ingredients (with updated snapshots) for affected recipes
      const { data: allRi } = await (admin.from('recipe_ingredients') as any)
        .select('recipe_id, qty, yield_pct, unit_cost, service_type')
        .eq('brand_id', brand_id)
        .in('recipe_id', recipeIds)

      // Fetch recipe details needed for FC% and margin
      const { data: recipeDetails } = await (admin.from('recipes') as any)
        .select('id, yield_portions, sell_price, app_price')
        .eq('brand_id', brand_id)
        .eq('is_active', true)
        .in('id', recipeIds)

      // Group ingredients by recipe_id
      const riByRecipe = new Map<string, any[]>()
      for (const row of (allRi || []) as any[]) {
        if (!riByRecipe.has(row.recipe_id)) riByRecipe.set(row.recipe_id, [])
        riByRecipe.get(row.recipe_id)!.push(row)
      }

      for (const recipe of (recipeDetails || []) as any[]) {
        const rows = riByRecipe.get(recipe.id) ?? []
        const calcCost = (rs: any[]) => rs.reduce((sum: number, r: any) => {
          const yp = r.yield_pct > 0 ? r.yield_pct : 100
          return sum + (r.qty / (yp / 100)) * (r.unit_cost ?? 0)
        }, 0)

        // Main: food rows (service_type = 'both' or 'dine_in')
        const mainRows = rows.filter((r: any) => r.service_type !== 'dine_out')
        const mainCost = calcCost(mainRows)

        // Dine-out: food rows + packaging rows
        const packagingRows = rows.filter((r: any) => r.service_type === 'dine_out')
        const dineOutCost = mainCost + calcCost(packagingRows)

        const portions     = Math.max(recipe.yield_portions ?? 1, 1)
        const perPortion   = mainCost / portions
        const sellExVat    = (recipe.sell_price ?? 0) / 1.15
        const appExVat     = recipe.app_price != null ? recipe.app_price / 1.15 : null
        const fcPct        = sellExVat > 0 ? (perPortion / sellExVat) * 100 : 0
        const margin       = sellExVat - perPortion
        const marginApp    = appExVat != null ? appExVat - perPortion : null

        const dinePerP     = dineOutCost / portions
        const dineOutFcPct = appExVat != null && appExVat > 0 ? (dinePerP / appExVat) * 100 : null
        const dineOutMargin = appExVat != null ? appExVat - dinePerP : null

        const R = (v: number) => Math.round(v * 10000) / 10000

        await (admin.from('recipes') as any)
          .update({
            total_cost:    R(mainCost),
            food_cost_pct: Math.round(fcPct * 100) / 100,
            margin:        R(margin),
            ...(marginApp != null ? { margin_app: R(marginApp) } : {}),
            ...(packagingRows.length > 0 ? {
              dine_out_total_cost:    R(dineOutCost),
              dine_out_food_cost_pct: dineOutFcPct != null ? Math.round(dineOutFcPct * 100) / 100 : null,
              dine_out_margin:        dineOutMargin != null ? R(dineOutMargin) : null,
            } : {}),
          })
          .eq('id', recipe.id)

        recipesUpdated++
      }
    }
  }

  return NextResponse.json({
    ok: true,
    updated: ingredientUpdates.length,
    stock_updated: stockUpserts.length,
    price_history: priceHistoryRows.length,
    recipes_updated: recipesUpdated,
  })
}

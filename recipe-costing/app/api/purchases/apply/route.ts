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

  // ── 1. Atomic WAC: حساب وتطبيق المتوسط المرجّح بـ SELECT FOR UPDATE ──
  const { data: wacResult, error: wacErr } = await (admin as any).rpc('apply_purchase_wac', {
    p_brand_id:     brand_id,
    p_import_batch: import_batch,
    p_performed_by: performed_by ?? null,
  })

  if (wacErr) return NextResponse.json({ error: wacErr.message }, { status: 500 })

  const wac = wacResult as { ok: boolean; updated: number; stock_updated: number; price_history: number; changed_ingredients: { sku: string; new_cost: number }[] }

  if (!wac?.ok) return NextResponse.json({ updated: 0, stock_updated: 0, price_history: 0, recipes_updated: 0 })

  const ingredientUpdates = wac.changed_ingredients ?? []

  // ── 2. Cascade: recalculate recipe costs for affected recipes ────────
  let recipesUpdated = 0
  if (ingredientUpdates.length > 0) {
    const changedSkus = ingredientUpdates.map((u: any) => u.sku)

    // Find recipe_ids that use any of the changed ingredients
    const { data: affected } = await (admin.from('recipe_ingredients') as any)
      .select('recipe_id')
      .eq('brand_id', brand_id)
      .in('ing_sku', changedSkus)

    const recipeIds = [...new Set((affected || []).map((r: any) => r.recipe_id as string))]

    if (recipeIds.length > 0) {
      // Update unit_cost snapshots in recipe_ingredients for changed SKUs
      for (const u of ingredientUpdates as any[]) {
        await (admin.from('recipe_ingredients') as any)
          .update({ unit_cost: u.new_cost })
          .eq('brand_id', brand_id)
          .eq('ing_sku', u.sku)
          .in('recipe_id', recipeIds)
      }

      // Fetch all recipe_ingredients (with updated snapshots) for affected recipes
      const { data: allRi } = await (admin.from('recipe_ingredients') as any)
        .select('recipe_id, qty, yield_pct, unit_cost, service_type')
        .eq('brand_id', brand_id)
        .in('recipe_id', recipeIds)

      // Fetch recipe details needed for FC% and margin
      const { data: recipeDetails } = await (admin.from('recipes') as any)
        .select('id, product_sku, yield_portions, sell_price, app_price')
        .eq('brand_id', brand_id)
        .eq('is_active', true)
        .in('id', recipeIds)

      // Group ingredients by recipe_id
      const riByRecipe = new Map<string, any[]>()
      for (const row of (allRi || []) as any[]) {
        if (!riByRecipe.has(row.recipe_id)) riByRecipe.set(row.recipe_id, [])
        riByRecipe.get(row.recipe_id)!.push(row)
      }

      // product_sku → per-portion cost (built during recipe loop, used for combo cascade)
      const productCostMap = new Map<string, number>()

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

        if (recipe.product_sku) productCostMap.set(recipe.product_sku, perPortion)

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

      // ── 7. Cascade: recalculate combo costs ──────────────────────
      if (productCostMap.size > 0) {
        const affectedProductSkus = [...productCostMap.keys()]

        const { data: affectedItems } = await (admin.from('combo_meal_items') as any)
          .select('id, combo_id, product_sku, qty')
          .eq('brand_id', brand_id)
          .in('product_sku', affectedProductSkus)

        if (affectedItems && (affectedItems as any[]).length > 0) {
          for (const item of affectedItems as any[]) {
            const newUnitCost = Math.round((productCostMap.get(item.product_sku) ?? 0) * 10000) / 10000
            await (admin.from('combo_meal_items') as any)
              .update({ unit_cost: newUnitCost, total_cost: Math.round(newUnitCost * item.qty * 10000) / 10000 })
              .eq('id', item.id)
          }

          const comboIds = [...new Set((affectedItems as any[]).map((i: any) => i.combo_id as string))]

          const [{ data: allComboItems }, { data: combos }] = await Promise.all([
            (admin.from('combo_meal_items') as any)
              .select('combo_id, unit_cost, qty')
              .eq('brand_id', brand_id)
              .in('combo_id', comboIds),
            (admin.from('combo_meals') as any)
              .select('id, price, app_price')
              .eq('brand_id', brand_id)
              .in('id', comboIds),
          ])

          const itemsByCombo = new Map<string, any[]>()
          for (const item of (allComboItems || []) as any[]) {
            if (!itemsByCombo.has(item.combo_id)) itemsByCombo.set(item.combo_id, [])
            itemsByCombo.get(item.combo_id)!.push(item)
          }

          for (const combo of (combos || []) as any[]) {
            const items = itemsByCombo.get(combo.id) ?? []
            const totalCost = Math.round(
              items.reduce((s: number, i: any) => s + (i.unit_cost ?? 0) * (i.qty ?? 1), 0) * 10000
            ) / 10000
            const sellExVat = (combo.price ?? 0) / 1.15
            const appExVat  = combo.app_price != null ? combo.app_price / 1.15 : null
            const fcPct     = sellExVat > 0 ? Math.round((totalCost / sellExVat) * 1000) / 10 : 0
            const margin    = Math.round((sellExVat - totalCost) * 100) / 100
            const marginApp = appExVat != null ? Math.round((appExVat - totalCost) * 100) / 100 : null

            await (admin.from('combo_meals') as any)
              .update({
                total_cost: totalCost,
                food_cost_pct: fcPct,
                margin,
                ...(marginApp != null ? { margin_app: marginApp } : {}),
              })
              .eq('id', combo.id)
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    updated:         wac.updated,
    stock_updated:   wac.stock_updated,
    price_history:   wac.price_history,
    recipes_updated: recipesUpdated,
  })
}

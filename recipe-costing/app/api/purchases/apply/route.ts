import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/purchases/apply
 * Applies a purchase batch using Weighted Average Cost (WAC).
 *
 * Body: { brand_id: string, import_batch: string, performed_by?: string }
 *
 * For each purchased ingredient:
 *   WAC = (stock_qty × old_cost + purchased_qty × purchase_price) / (stock_qty + purchased_qty)
 *
 * Also:
 *   - Updates stock_items.current_qty (adds purchased qty)
 *   - Records price changes in price_history
 */
export async function POST(request: NextRequest) {
  const serverClient = await createClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { brand_id, import_batch, performed_by } = await request.json()
  if (!brand_id || !import_batch) {
    return NextResponse.json({ error: 'brand_id و import_batch مطلوبان' }, { status: 400 })
  }

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

  return NextResponse.json({
    ok: true,
    updated: ingredientUpdates.length,
    stock_updated: stockUpserts.length,
    price_history: priceHistoryRows.length,
  })
}

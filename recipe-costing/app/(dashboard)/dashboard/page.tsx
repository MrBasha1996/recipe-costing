import { getServerBrand } from '@/lib/server-brand'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'
import { VAT_RATE } from '@/lib/calculations'
import type { Recipe } from '@/types'

export default async function DashboardPage() {
  const brand    = await getServerBrand()
  const supabase = await createClient()

  const toLocal = (offset: number) => new Date(Date.now() + offset).toLocaleDateString('en-CA')
  const todayStr      = toLocal(0)
  const yesterdayStr  = toLocal(-86400000)
  const lastWkSameDay = toLocal(-8 * 86400000)
  const weekAgoStr    = toLocal(-7 * 86400000)
  const in3Str        = toLocal(3 * 86400000)

  const [
    { data: brandRow },
    { data: recipes },
    { data: salesYest },
    { data: salesLastWk },
    { data: sales7d },
    { data: stockItems },
    { data: ings },
    { data: batchProds },
    { data: wasteLogs },
    { data: recipesFC },
  ] = await Promise.all([
    (supabase.from('brands') as any).select('fc_target_low, fc_target_high').eq('id', brand).single(),
    (supabase.from('recipes') as any).select('*').eq('brand_id', brand as string).order('food_cost_pct', { ascending: false }),
    (supabase.from('daily_sales') as any).select('product_sku, product_name, qty_sold, revenue').eq('brand_id', brand).eq('sale_date', yesterdayStr),
    (supabase.from('daily_sales') as any).select('qty_sold, revenue').eq('brand_id', brand).eq('sale_date', lastWkSameDay),
    (supabase.from('daily_sales') as any).select('product_sku, revenue').eq('brand_id', brand).gte('sale_date', weekAgoStr).lte('sale_date', yesterdayStr),
    (supabase.from('stock_items') as any).select('ing_sku, ing_name, current_qty, min_qty, expiry_date').eq('brand_id', brand),
    (supabase.from('ingredients') as any).select('sku, cost').eq('brand_id', brand),
    (supabase.from('products') as any).select('sku, price').eq('brand_id', brand).or('is_semi.eq.true,category.eq.Batch'),
    (supabase.from('waste_log') as any).select('value').eq('brand_id', brand).gte('log_date', weekAgoStr),
    (supabase.from('recipes') as any).select('sku, food_cost_pct').eq('brand_id', brand).eq('is_active', true),
  ])

  const fcLow  = (brandRow as any)?.fc_target_low  ?? 35
  const fcHigh = (brandRow as any)?.fc_target_high ?? 45

  // Ops calculations
  const revYest   = ((salesYest  || []) as any[]).reduce((s, r) => s + r.revenue, 0) / VAT_RATE
  const qtyYest   = ((salesYest  || []) as any[]).reduce((s, r) => s + r.qty_sold, 0)
  const revLastWk = ((salesLastWk|| []) as any[]).reduce((s, r) => s + r.revenue, 0) / VAT_RATE
  const qtyLastWk = ((salesLastWk|| []) as any[]).reduce((s, r) => s + r.qty_sold, 0)

  const recipeMap = new Map<string, number>()
  for (const r of (recipesFC || []) as any[]) recipeMap.set(r.sku, r.food_cost_pct)
  let totalRev7 = 0, totalCost7 = 0
  for (const s of (sales7d || []) as any[]) {
    const fc = recipeMap.get(s.product_sku); if (fc == null) continue
    const rev = s.revenue / VAT_RATE; totalRev7 += rev; totalCost7 += rev * (fc / 100)
  }
  const fcWeek = totalRev7 > 0 ? (totalCost7 / totalRev7) * 100 : 0

  const costMap = new Map<string, number>()
  for (const i of (ings || []) as any[]) costMap.set(i.sku, i.cost)
  for (const b of (batchProds || []) as any[]) costMap.set(b.sku, b.price)
  const batchSkus = new Set((batchProds || []).map((b: any) => b.sku as string))

  const stocks = (stockItems || []) as any[]
  const lowStockCount   = stocks.filter(s => s.min_qty > 0 && s.current_qty > 0 && s.current_qty <= s.min_qty).length
  const emptyStockCount = stocks.filter(s => s.min_qty > 0 && s.current_qty <= 0).length
  const expiringCount   = stocks.filter(s => s.expiry_date && s.expiry_date > todayStr && s.expiry_date <= in3Str && s.current_qty > 0).length
  const expiredCount    = stocks.filter(s => s.expiry_date && s.expiry_date < todayStr && s.current_qty > 0).length
  const inventoryValue  = stocks.reduce((sum, s) => sum + s.current_qty * (costMap.get(s.ing_sku) ?? 0), 0)
  const batchesLow      = stocks.filter(s => batchSkus.has(s.ing_sku) && s.current_qty <= 0)
    .map(s => ({ ing_sku: s.ing_sku, ing_name: s.ing_name, current_qty: s.current_qty }))
  const wasteValue7d = ((wasteLogs || []) as any[]).reduce((s, r) => s + (r.value ?? 0), 0)

  const pMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const s of (salesYest || []) as any[]) {
    const ex = pMap.get(s.product_sku)
    if (ex) { ex.qty += s.qty_sold; ex.revenue += s.revenue }
    else pMap.set(s.product_sku, { name: s.product_name, qty: s.qty_sold, revenue: s.revenue })
  }
  const top5 = [...pMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(p => ({ ...p, revenue: p.revenue / VAT_RATE }))

  return (
    <DashboardClient
      recipes={(recipes as Recipe[]) ?? []}
      opsData={{ revYest, qtyYest, revLastWeek: revLastWk, qtyLastWeek: qtyLastWk, fcWeek, lowStockCount, emptyStockCount, expiringCount, expiredCount, inventoryValue, wasteValue7d, top5, batchesLow, fetchedAt: new Date().toISOString() }}
      brand={brand}
      fcLow={fcLow}
      fcHigh={fcHigh}
    />
  )
}

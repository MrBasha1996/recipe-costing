import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import PurchasingClient from './PurchasingClient'

interface BatchSummary {
  import_batch: string; purchase_date: string; supplier_name: string
  item_count: number; total_amount: number; imported_at: string
}

export default async function PurchasingPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()

  const [{ data: purchasesData }, { data: conversionsData }] = await Promise.all([
    (supabase.from('purchases') as any)
      .select('import_batch, purchase_date, supplier_name, total_price, created_at')
      .eq('brand_id', brand)
      .order('created_at', { ascending: false }),
    (supabase.from('unit_conversions') as any)
      .select('ing_sku, factor, buy_unit, recipe_unit')
      .eq('brand_id', brand),
  ])

  // Build batch summaries server-side
  const map = new Map<string, BatchSummary>()
  for (const row of (purchasesData || []) as any[]) {
    const b = row.import_batch
    if (!map.has(b)) map.set(b, { import_batch: b, purchase_date: row.purchase_date, supplier_name: row.supplier_name, item_count: 0, total_amount: 0, imported_at: row.created_at })
    const s = map.get(b)!
    s.item_count++
    s.total_amount += row.total_price
  }

  return (
    <PurchasingClient
      initialBatches={[...map.values()]}
      conversionRows={(conversionsData || []) as any[]}
      brand={brand}
    />
  )
}

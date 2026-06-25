import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import SalesClient from './SalesClient'

interface BatchSummary {
  import_batch: string; sale_date: string; item_count: number
  total_qty: number; total_revenue: number; source: string
  imported_at: string; exploded_at: string | null
}

export default async function SalesPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()

  const { data } = await (supabase.from('daily_sales') as any)
    .select('import_batch, sale_date, qty_sold, revenue, source, created_at, exploded_at')
    .eq('brand_id', brand)
    .order('created_at', { ascending: false })

  const map = new Map<string, BatchSummary>()
  for (const row of (data || []) as any[]) {
    const b = row.import_batch
    if (!map.has(b)) map.set(b, {
      import_batch: b, sale_date: row.sale_date, item_count: 0,
      total_qty: 0, total_revenue: 0, source: row.source ?? 'excel',
      imported_at: row.created_at, exploded_at: row.exploded_at ?? null,
    })
    const s = map.get(b)!
    s.item_count++
    s.total_qty    += row.qty_sold ?? 0
    s.total_revenue += row.revenue ?? 0
    if (row.exploded_at && !s.exploded_at) s.exploded_at = row.exploded_at
  }

  return <SalesClient initialBatches={[...map.values()]} brand={brand} />
}

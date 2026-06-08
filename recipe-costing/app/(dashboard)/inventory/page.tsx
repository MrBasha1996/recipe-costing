import { getServerBrand } from '@/lib/server-brand'
import { createClient } from '@/lib/supabase/server'
import InventoryClient from './InventoryClient'
import type { StockMovement } from '@/types'

interface InventoryItem {
  sku: string; name: string; unit: string; type: 'ingredient' | 'batch'
  stock_id: string | null; current_qty: number; min_qty: number
  expiry_date: string | null; batch_number: string | null
}

function stockStatus(item: InventoryItem): 'ok' | 'low' | 'empty' {
  if (item.current_qty <= 0) return 'empty'
  if (item.current_qty <= item.min_qty) return 'low'
  return 'ok'
}

export default async function InventoryPage() {
  const brand = await getServerBrand()
  const supabase = await createClient()

  const [{ data: ings }, { data: batches }, { data: stockRows }, { data: moves }] = await Promise.all([
    (supabase.from('ingredients') as any).select('sku, name, unit').eq('brand_id', brand),
    (supabase.from('products') as any).select('sku, name, unit').eq('brand_id', brand).or('is_semi.eq.true,category.eq.Batch'),
    (supabase.from('stock_items') as any).select('id, ing_sku, current_qty, min_qty, expiry_date, batch_number').eq('brand_id', brand),
    (supabase.from('stock_movements') as any).select('*').eq('brand_id', brand).order('created_at', { ascending: false }).limit(200),
  ])

  const stockMap = new Map<string, { id: string; current_qty: number; min_qty: number; expiry_date: string | null; batch_number: string | null }>()
  for (const s of (stockRows || []) as any[]) {
    stockMap.set(s.ing_sku, { id: s.id, current_qty: s.current_qty, min_qty: s.min_qty, expiry_date: s.expiry_date ?? null, batch_number: s.batch_number ?? null })
  }

  const merged: InventoryItem[] = [
    ...((ings || []) as any[]).map((i: any) => {
      const s = stockMap.get(i.sku)
      return { sku: i.sku, name: i.name, unit: i.unit ?? '—', type: 'ingredient' as const, stock_id: s?.id ?? null, current_qty: s?.current_qty ?? 0, min_qty: s?.min_qty ?? 0, expiry_date: s?.expiry_date ?? null, batch_number: s?.batch_number ?? null }
    }),
    ...((batches || []) as any[]).map((b: any) => {
      const s = stockMap.get(b.sku)
      return { sku: b.sku, name: b.name, unit: b.unit ?? '—', type: 'batch' as const, stock_id: s?.id ?? null, current_qty: s?.current_qty ?? 0, min_qty: s?.min_qty ?? 0, expiry_date: s?.expiry_date ?? null, batch_number: s?.batch_number ?? null }
    }),
  ]

  merged.sort((a, b) => {
    const order = { empty: 0, low: 1, ok: 2 }
    const diff = order[stockStatus(a)] - order[stockStatus(b)]
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ar')
  })

  return (
    <InventoryClient
      initialItems={merged}
      initialMovements={(moves as StockMovement[]) ?? []}
      brand={brand}
    />
  )
}

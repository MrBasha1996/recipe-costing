import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import CostsClient from './CostsClient'
import { getCurrentYearMonth } from '@/lib/period'
import type { LaborCost, OverheadCost } from '@/types'

export default async function CostsPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()
  const month    = getCurrentYearMonth()

  const [{ data: labor }, { data: overhead }] = await Promise.all([
    (supabase.from('labor_costs') as any)
      .select('*').eq('brand_id', brand).eq('month', month)
      .order('department').order('created_at'),
    (supabase.from('overhead_costs') as any)
      .select('*').eq('brand_id', brand).eq('month', month)
      .order('category'),
  ])

  return (
    <CostsClient
      initialLabor={(labor as LaborCost[]) || []}
      initialOverhead={(overhead as OverheadCost[]) || []}
      brand={brand}
    />
  )
}

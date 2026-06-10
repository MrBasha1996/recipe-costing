import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import ReportsClient from './ReportsClient'

export default async function ReportsPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()

  const [{ data: salesData }, { data: brandRow }] = await Promise.all([
    (supabase.from('daily_sales') as any)
      .select('branch_name').eq('brand_id', brand).not('branch_name', 'is', null),
    (supabase.from('brands') as any)
      .select('fc_target_low, fc_target_high').eq('id', brand).single(),
  ])

  const names: string[] = (salesData || [])
    .map((r: any) => r.branch_name as string)
    .filter((x: unknown): x is string => Boolean(x))
  const branches = [...new Set(names)].sort()

  return (
    <ReportsClient
      initialBranches={branches}
      initialFcLow={brandRow?.fc_target_low ?? 35}
      initialFcHigh={brandRow?.fc_target_high ?? 45}
    />
  )
}

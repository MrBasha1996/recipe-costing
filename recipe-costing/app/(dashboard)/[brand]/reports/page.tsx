import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import ReportsClient from './ReportsClient'

export default async function ReportsPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()

  const [{ data: branchData }, { data: brandRow }] = await Promise.all([
    (supabase as any).rpc('get_accessible_branches', { p_brand_id: brand }),
    (supabase.from('brands') as any)
      .select('fc_target_low, fc_target_high').eq('id', brand).single(),
  ])

  const branches: string[] = (branchData ?? []).map((b: any) => b.branch_name as string)

  return (
    <ReportsClient
      initialBranches={branches}
      initialFcLow={brandRow?.fc_target_low ?? 35}
      initialFcHigh={brandRow?.fc_target_high ?? 45}
    />
  )
}

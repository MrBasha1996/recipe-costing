import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import SettingsClient from './SettingsClient'

export default async function SettingsPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()

  const { data } = await (supabase.from('brands') as any)
    .select('delivery_commission_pct, fc_target_low, fc_target_high, tax_reg_number')
    .eq('id', brand)
    .single()

  return (
    <SettingsClient
      initialCommission={data?.delivery_commission_pct ?? 0}
      initialFcLow={data?.fc_target_low ?? 35}
      initialFcHigh={data?.fc_target_high ?? 45}
      initialTrn={data?.tax_reg_number ?? ''}
    />
  )
}

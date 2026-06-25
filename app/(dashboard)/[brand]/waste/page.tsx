import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'
import { getCurrentYearMonth, monthRange } from '@/lib/period'
import WasteClient from './WasteClient'
import type { WasteLog } from '@/types'

export default async function WastePage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: brandParam } = await params
  const brand = brandParam as BrandId
  const supabase = await createClient()
  const month = getCurrentYearMonth()
  const { start, end } = monthRange(month)

  const { data } = await (supabase.from('waste_log') as any)
    .select('*')
    .eq('brand_id', brand)
    .gte('log_date', start)
    .lte('log_date', end)
    .order('log_date', { ascending: false })

  return (
    <WasteClient
      initialLogs={(data as WasteLog[]) ?? []}
      initialMonth={month}
      brand={brand}
    />
  )
}

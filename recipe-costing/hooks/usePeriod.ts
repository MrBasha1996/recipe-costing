'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentYearMonth } from '@/lib/period'

// Periods are company-wide — stored with brand_id = 'global'
const GLOBAL_BRAND = 'global'

export interface ClosedPeriod {
  id: string
  year_month: string
  closed_at: string
  note: string | null
}

export function usePeriod() {
  const [closedPeriods, setClosedPeriods] = useState<ClosedPeriod[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await (supabase.from('closed_periods') as any)
      .select('id, year_month, closed_at, note')
      .eq('brand_id', GLOBAL_BRAND)
      .order('year_month', { ascending: false })
    setClosedPeriods((data as ClosedPeriod[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const closedSet = new Set(closedPeriods.map(p => p.year_month))
  const currentYM = getCurrentYearMonth()

  return {
    loading,
    closedPeriods,
    closedSet,
    currentYM,
    isCurrentClosed: closedSet.has(currentYM),
    isClosed: (ym: string) => closedSet.has(ym),
    reload,
    GLOBAL_BRAND,
  }
}

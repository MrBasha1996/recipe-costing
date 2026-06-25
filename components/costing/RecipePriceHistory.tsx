'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { BrandId } from '@/types'
import { C, MONO } from './theme'

interface Props {
  sku: string
  brand: BrandId
}

interface HistoryPoint {
  month: string
  label: string
  di: number | null
  do_: number | null
  app: number | null
}

export default function RecipePriceHistory({ sku, brand }: Props) {
  const [points, setPoints] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const since = new Date()
      since.setMonth(since.getMonth() - 12)

      const { data } = await (supabase.from('audit_logs') as any)
        .select('created_at, metadata')
        .eq('entity_sku', sku)
        .eq('entity_type', 'recipe')
        .eq('brand_id', brand as string)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (!data || data.length === 0) {
        setPoints([])
        setLoading(false)
        return
      }

      const byMonth: Record<string, { di: number | null; do_: number | null; app: number | null }> = {}
      for (const row of data) {
        const m = row.created_at.slice(0, 7)
        const meta = (row.metadata ?? {}) as Record<string, unknown>
        byMonth[m] = {
          di:  typeof meta.di_food_cost_pct  === 'number' ? meta.di_food_cost_pct  : null,
          do_: typeof meta.do_food_cost_pct  === 'number' ? meta.do_food_cost_pct  : null,
          app: typeof meta.app_food_cost_pct === 'number' ? meta.app_food_cost_pct : null,
        }
      }

      const result: HistoryPoint[] = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => {
          const [y, m] = month.split('-')
          const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' })
          return { month, label, ...v }
        })

      setPoints(result)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [sku, brand])

  if (loading) return null

  if (points.length < 2) {
    return (
      <div style={{
        background: '#fff', border: `1px solid ${C.border}`,
        borderRadius: 16, padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gray800, marginBottom: 8 }}>
          PRICE CHANGE — تاريخ تغيرات الأسعار
        </div>
        <div style={{
          height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.gray400, fontSize: 12,
        }}>
          سيظهر السجل بعد حفظ الوصفة مرتين على الأقل
        </div>
      </div>
    )
  }

  const hasApp = points.some(p => p.app != null)

  const legendItems = [
    { label: 'Cost IN',  color: C.primary },
    { label: 'Cost OUT', color: C.accent  },
    ...(hasApp ? [{ label: 'Cost AGG', color: C.green }] : []),
  ]

  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.border}`,
      borderRadius: 16, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Header with inline legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gray800 }}>
          PRICE CHANGE — تاريخ تغيرات الأسعار
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {legendItems.map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.gray600 }}>
              <div style={{ width: 20, height: 2, borderRadius: 1, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fontFamily: MONO, fill: C.gray400 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fontFamily: MONO, fill: C.gray400 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              formatter={(value, name) => {
              const v = typeof value === 'number' ? value : 0
              return [`${v.toFixed(1)}%`, name]
            }}
            />
            <Line
              type="monotone"
              dataKey="di"
              name="Cost IN"
              stroke={C.primary}
              strokeWidth={2}
              dot={{ r: 3, fill: C.primary }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="do_"
              name="Cost OUT"
              stroke={C.accent}
              strokeWidth={2}
              dot={{ r: 3, fill: C.accent }}
              connectNulls
            />
            {hasApp && (
              <Line
                type="monotone"
                dataKey="app"
                name="Cost AGG"
                stroke={C.green}
                strokeWidth={2}
                dot={{ r: 3, fill: C.green }}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

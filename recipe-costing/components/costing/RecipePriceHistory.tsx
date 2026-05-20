'use client'

import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend,
} from 'chart.js'
import { createClient } from '@/lib/supabase/client'
import type { BrandId } from '@/types'
import { C, MONO } from './theme'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

interface Props {
  sku: string
  brand: BrandId
}

interface HistoryPoint {
  month: string
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
        .map(([month, v]) => ({ month, ...v }))

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

  const labels = points.map(p => {
    const [y, m] = p.month.split('-')
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' })
  })

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
      <div style={{ height: 180, position: 'relative' }}>
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'Cost IN',
                data: points.map(p => p.di),
                borderColor: C.primary,
                backgroundColor: `${C.primary}10`,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: C.primary,
                tension: 0.4,
                fill: false,
              },
              {
                label: 'Cost OUT',
                data: points.map(p => p.do_),
                borderColor: C.accent,
                backgroundColor: `${C.accent}10`,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: C.accent,
                tension: 0.4,
                fill: false,
              },
              ...(hasApp ? [{
                label: 'Cost AGG',
                data: points.map(p => p.app),
                borderColor: C.green,
                backgroundColor: `${C.green}10`,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: C.green,
                tension: 0.4,
                fill: false,
              }] : []),
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y as number).toFixed(1)}%`,
                },
              },
            },
            scales: {
              x: {
                grid: { color: 'rgba(0,0,0,0.04)' },
                ticks: { font: { size: 11, family: MONO }, color: C.gray400 },
              },
              y: {
                beginAtZero: false,
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: {
                  font: { size: 11, family: MONO },
                  color: C.gray400,
                  callback: v => `${v}%`,
                },
              },
            },
          }}
        />
      </div>
    </div>
  )
}

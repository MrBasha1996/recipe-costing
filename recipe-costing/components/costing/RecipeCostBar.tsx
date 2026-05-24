'use client'

import { useState } from 'react'
import type { RecipeRowDraft } from '@/types'
import { calcRowCost } from '@/lib/calculations'
import { C, MONO } from './theme'

interface Props {
  foodRows: RecipeRowDraft[]
  diPackaging: RecipeRowDraft[]
  doPackaging: RecipeRowDraft[]
  yieldPortions: number
  sellPrice: number
}

export default function RecipeCostBar({
  foodRows, diPackaging, doPackaging, yieldPortions, sellPrice,
}: Props) {
  const [service, setService] = useState<'dine_in' | 'dine_out'>('dine_in')

  if (foodRows.length === 0 && diPackaging.length === 0 && doPackaging.length === 0) return null

  const portions = Math.max(yieldPortions, 1)
  const packRows = service === 'dine_in' ? diPackaging : doPackaging

  const foodTotal = foodRows.reduce((s, r) => s + calcRowCost(r.qty, r.yield_pct, r.unit_cost), 0)
  const packTotal = packRows.reduce((s, r) => s + calcRowCost(r.qty, r.yield_pct, r.unit_cost), 0)

  const foodPortion = foodTotal / portions
  const packPortion = packTotal / portions
  const totalPortion = foodPortion + packPortion
  const priceExVat = sellPrice / 1.15
  const margin = priceExVat - totalPortion

  const base = priceExVat > 0 ? priceExVat : totalPortion
  const foodPct  = base > 0 ? (foodPortion  / base) * 100 : 0
  const packPct  = base > 0 ? (packPortion  / base) * 100 : 0
  const marginPct = base > 0 ? Math.max(0, (margin / base) * 100) : 0

  const segments = [
    { pct: foodPct,   color: C.green,   label: 'الغذاء',    value: foodPortion,  key: 'food' },
    { pct: packPct,   color: C.accent,  label: 'التغليف',   value: packPortion,  key: 'pkg'  },
    { pct: marginPct, color: C.primary, label: 'هامش الربح', value: margin,       key: 'mar'  },
  ]

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: '18px 22px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.gray400 }}>
          توزيع التكلفة من سعر البيع
        </span>
        <div style={{ display: 'flex', gap: 2, background: C.gray100, borderRadius: 8, padding: 3 }}>
          {(['dine_in', 'dine_out'] as const).map(s => (
            <button
              key={s}
              onClick={() => setService(s)}
              style={{
                padding: '5px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: service === s ? '#fff' : 'transparent',
                color: service === s ? C.gray800 : C.gray400,
                boxShadow: service === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {s === 'dine_in' ? '🍽 Dine In' : '🛵 Dine Out'}
            </button>
          ))}
        </div>
      </div>

      {/* Bar */}
      <div style={{
        height: 28, borderRadius: 6, overflow: 'hidden',
        display: 'flex', background: C.gray100, marginBottom: 10,
      }}>
        {segments.map(seg => seg.pct > 0 && (
          <div
            key={seg.key}
            style={{
              width: `${seg.pct}%`,
              background: seg.color,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              transition: 'width 0.3s ease',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              padding: '0 4px',
            }}
          >
            {seg.pct > 8 ? `${seg.pct.toFixed(1)}%` : ''}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {segments.map(seg => (
          <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.gray600 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span>{seg.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, color: C.gray800 }}>
              {seg.value.toFixed(2)} ر.س
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.gray400 }}>
              ({seg.pct.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

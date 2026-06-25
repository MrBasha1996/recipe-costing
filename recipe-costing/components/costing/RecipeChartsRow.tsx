'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { RecipeRowDraft } from '@/types'
import { calcRowCost } from '@/lib/calculations'
import { C, MONO, PALETTE } from './theme'

interface Props {
  foodRows: RecipeRowDraft[]
  diPackaging: RecipeRowDraft[]
  doPackaging: RecipeRowDraft[]
}

export default function RecipeChartsRow({ foodRows, diPackaging, doPackaging }: Props) {
  const hasFood = foodRows.length > 0
  const hasDI   = diPackaging.length > 0
  const hasDO   = doPackaging.length > 0

  if (!hasFood && !hasDI && !hasDO) return null

  const foodTotal = foodRows.reduce((s, r) => s + calcRowCost(r.qty, r.yield_pct, r.unit_cost), 0)
  const diTotal   = diPackaging.reduce((s, r) => s + calcRowCost(r.qty, r.yield_pct, r.unit_cost), 0)
  const doTotal   = doPackaging.reduce((s, r) => s + calcRowCost(r.qty, r.yield_pct, r.unit_cost), 0)

  const summaryItems = [
    { label: 'Food — غذاء', value: foodTotal, color: C.green },
    { label: 'Package IN', value: diTotal, color: C.primary },
    { label: 'Package OUT', value: doTotal, color: C.accent },
  ].filter(x => x.value > 0)

  const summaryTotal = summaryItems.reduce((s, x) => s + x.value, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary donut — food vs packaging */}
      {summaryItems.length > 1 && (
        <div style={{
          background: '#fff', border: `1px solid ${C.border}`, borderRadius: 16,
          padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: C.gray400,
            marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.primary, display: 'inline-block', flexShrink: 0 }} />
            COST RATIO — نسبة التكاليف (غذاء مقابل تغليف)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24, alignItems: 'center' }}>
            <div style={{ position: 'relative', height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summaryItems}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    strokeWidth={2}
                    stroke="#fff"
                  >
                    {summaryItems.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => {
                      const v = typeof value === 'number' ? value : 0
                      const pct = summaryTotal > 0 ? ((v / summaryTotal) * 100).toFixed(1) : '0'
                      return [`${v.toFixed(3)} ر.س (${pct}%)`, name]
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {summaryItems.map(item => {
                const pct = summaryTotal > 0 ? ((item.value / summaryTotal) * 100).toFixed(1) : '0'
                return (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: C.gray600 }}>{item.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.gray800 }}>
                      {item.value.toFixed(3)} ر.س
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.gray400, minWidth: 44, textAlign: 'left' }}>
                      {pct}%
                    </span>
                  </div>
                )
              })}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.gray600, fontWeight: 600 }}>
                <span>الإجمالي</span>
                <span style={{ fontFamily: MONO, color: C.gray800 }}>{summaryTotal.toFixed(3)} ر.س</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Individual breakdown charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <ChartCard
          title="FOOD — توزيع المواد الغذائية"
          dotColor={C.green}
          rows={foodRows}
          emptyMsg="لا توجد مواد غذائية"
        />
        <ChartCard
          title="PACKAGE IN — التغليف (داخلي)"
          dotColor={C.green}
          rows={diPackaging}
          emptyMsg="لا يوجد تغليف Dine In"
        />
        <ChartCard
          title="PACKAGE OUT — التغليف (تسليم)"
          dotColor={C.accent}
          rows={doPackaging}
          emptyMsg="لا يوجد تغليف Dine Out"
          palette={[C.accent, '#e8a07a', C.blue, C.gold, C.gray400]}
        />
      </div>
    </div>
  )
}

function ChartCard({
  title, dotColor, rows, emptyMsg,
  palette = PALETTE,
}: {
  title: string
  dotColor: string
  rows: RecipeRowDraft[]
  emptyMsg: string
  palette?: string[]
}) {
  const items = rows
    .map(r => ({ label: r.ing_name, value: calcRowCost(r.qty, r.yield_pct, r.unit_cost) }))
    .filter(x => x.value > 0)

  const total = items.reduce((s, x) => s + x.value, 0)

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: C.gray400,
        marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
        {title}
      </div>

      {items.length === 0 ? (
        <div style={{
          height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.gray400, fontSize: 12, textAlign: 'center',
        }}>
          {emptyMsg}
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {items.map((_, i) => (
                    <Cell key={i} fill={palette[i % palette.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => {
                    const v = typeof value === 'number' ? value : 0
                    const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0'
                    return [`${v.toFixed(3)} ر.س (${pct}%)`, name]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 120, overflowY: 'auto' }}>
            {items.map((item, i) => {
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.gray600 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: palette[i % palette.length], flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                  <span style={{ fontFamily: MONO, fontWeight: 500, color: C.gray800, flexShrink: 0 }}>
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

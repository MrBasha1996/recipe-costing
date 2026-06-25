'use client'

import { useState } from 'react'
import type { RecipeRowDraft, ComponentItem } from '@/types'
import { calcRowCost } from '@/lib/calculations'
import IngredientAutocomplete from '@/components/shared/IngredientAutocomplete'
import { C, MONO } from './theme'

type AddMode = 'dine_in' | 'dine_out' | 'both'

interface Props {
  diRows: RecipeRowDraft[]
  doRows: RecipeRowDraft[]
  canEdit: boolean
  canSeePrices: boolean
  onQtyChange: (id: string, qty: number) => void
  onDelete: (id: string) => void
  onAddDI: (item: ComponentItem) => void
  onAddDO: (item: ComponentItem) => void
}

const th: React.CSSProperties = {
  padding: '10px 14px', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: C.gray400, textAlign: 'right', whiteSpace: 'nowrap', background: C.gray50,
}
const td: React.CSSProperties = {
  padding: '10px 14px', color: C.gray800, verticalAlign: 'middle',
  textAlign: 'right', borderBottom: `1px solid ${C.gray100}`, fontSize: 13,
}
const tdNum: React.CSSProperties = { ...td, fontFamily: MONO, fontSize: 12, textAlign: 'left' }

const ADD_MODES: { value: AddMode; label: string; color: string }[] = [
  { value: 'dine_in',  label: '🍽 Dine In',  color: C.green  },
  { value: 'dine_out', label: '🛵 Dine Out', color: C.accent },
  { value: 'both',     label: '⬡ Both',      color: C.primary },
]

export default function RecipePackageTable({
  diRows, doRows, canEdit, canSeePrices,
  onQtyChange, onDelete, onAddDI, onAddDO,
}: Props) {
  const [addMode, setAddMode] = useState<AddMode>('dine_in')

  const allRows = [...diRows, ...doRows]
  const totalDI = diRows.reduce((s, r) => s + calcRowCost(r.qty, r.yield_pct, r.unit_cost), 0)
  const totalDO = doRows.reduce((s, r) => s + calcRowCost(r.qty, r.yield_pct, r.unit_cost), 0)

  function handleAdd(item: ComponentItem) {
    if (addMode === 'dine_in'  || addMode === 'both') onAddDI(item)
    if (addMode === 'dine_out' || addMode === 'both') onAddDO(item)
  }

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Section pill header */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.gray50, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          letterSpacing: '0.04em', background: C.accentLight, color: C.accent,
          border: `1px solid ${C.accentBorder}`,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, display: 'inline-block' }} />
          Package Items — مواد التغليف
          <span style={{ marginRight: 4, opacity: 0.6, fontSize: 11 }}>({allRows.length})</span>
        </span>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}`, fontWeight: 500 }}>
            IN = Dine In
          </span>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, background: C.accentLight, color: C.accent, border: `1px solid ${C.accentBorder}`, fontWeight: 500 }}>
            OUT = Dine Out
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table suppressHydrationWarning style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1.5px solid ${C.border}` }}>
              <th style={th}>Item ID</th>
              <th style={{ ...th, textAlign: 'center' }}>Type</th>
              <th style={th}>Item Name</th>
              <th style={{ ...th, textAlign: 'center' }}>UM</th>
              <th style={{ ...th, textAlign: 'left', color: C.green }}>IN</th>
              <th style={{ ...th, textAlign: 'left', color: C.accent }}>OUT</th>
              {canSeePrices && <th style={{ ...th, textAlign: 'left' }}>Price</th>}
              {canSeePrices && <th style={{ ...th, textAlign: 'left', color: C.green }}>Total IN</th>}
              {canSeePrices && <th style={{ ...th, textAlign: 'left', color: C.accent }}>Total OUT</th>}
              {canEdit && <th style={{ ...th, width: 36 }} />}
            </tr>
          </thead>
          <tbody>
            {allRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6 + (canSeePrices ? 3 : 0) + (canEdit ? 1 : 0)}
                  style={{ ...td, textAlign: 'center', padding: '32px 16px', color: C.gray400, borderBottom: 'none' }}
                >
                  {canEdit ? 'أضف تغليف بالأسفل' : 'لا يوجد تغليف'}
                </td>
              </tr>
            ) : (
              allRows.map((row, i) => {
                const isDI = row.service_type === 'dine_in'
                const lineCost = calcRowCost(row.qty, row.yield_pct, row.unit_cost)
                const isLast = i === allRows.length - 1
                const rowBg = i % 2 !== 0 ? C.gray50 : '#fff'

                return (
                  <tr
                    key={row.id}
                    style={{ background: rowBg, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.gray100)}
                    onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                  >
                    <td style={{ ...td, borderBottom: isLast && !canSeePrices ? 'none' : td.borderBottom }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.gray400 }}>{row.ing_sku}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'center', borderBottom: isLast && !canSeePrices ? 'none' : td.borderBottom }}>
                      <TypeBadge isSemi={row.is_semi} />
                    </td>
                    <td style={{ ...td, borderBottom: isLast && !canSeePrices ? 'none' : td.borderBottom }}>
                      {row.ing_name}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 12, color: C.gray400, borderBottom: isLast && !canSeePrices ? 'none' : td.borderBottom }}>
                      {row.unit}
                    </td>

                    {/* IN qty */}
                    <td style={{ ...tdNum, borderBottom: isLast && !canSeePrices ? 'none' : td.borderBottom }}>
                      {isDI ? (
                        canEdit ? (
                          <input
                            type="number" value={row.qty}
                            onChange={e => onQtyChange(row.id, parseFloat(e.target.value) || 0)}
                            min={0} step={0.001}
                            style={{
                              width: 64, background: '#fff', border: `1px solid ${C.greenBorder}`,
                              borderRadius: 6, padding: '3px 6px', fontSize: 12,
                              textAlign: 'center', outline: 'none', fontFamily: MONO, color: C.green,
                            }}
                          />
                        ) : (
                          <span style={{ color: C.green }}>{row.qty}</span>
                        )
                      ) : (
                        <span style={{ color: C.gray400 }}>—</span>
                      )}
                    </td>

                    {/* OUT qty */}
                    <td style={{ ...tdNum, borderBottom: isLast && !canSeePrices ? 'none' : td.borderBottom }}>
                      {!isDI ? (
                        canEdit ? (
                          <input
                            type="number" value={row.qty}
                            onChange={e => onQtyChange(row.id, parseFloat(e.target.value) || 0)}
                            min={0} step={0.001}
                            style={{
                              width: 64, background: '#fff', border: `1px solid ${C.accentBorder}`,
                              borderRadius: 6, padding: '3px 6px', fontSize: 12,
                              textAlign: 'center', outline: 'none', fontFamily: MONO, color: C.accent,
                            }}
                          />
                        ) : (
                          <span style={{ color: C.accent }}>{row.qty}</span>
                        )
                      ) : (
                        <span style={{ color: C.gray400 }}>—</span>
                      )}
                    </td>

                    {canSeePrices && (
                      <td style={{ ...tdNum, color: C.gray400, borderBottom: isLast ? 'none' : td.borderBottom }}>
                        {row.unit_cost.toFixed(3)}
                      </td>
                    )}
                    {canSeePrices && (
                      <td style={{ ...tdNum, fontWeight: 600, borderBottom: isLast ? 'none' : td.borderBottom }}>
                        {isDI ? <span style={{ color: C.green }}>{lineCost.toFixed(3)}</span> : <span style={{ color: C.gray400 }}>—</span>}
                      </td>
                    )}
                    {canSeePrices && (
                      <td style={{ ...tdNum, fontWeight: 600, borderBottom: isLast ? 'none' : td.borderBottom }}>
                        {!isDI ? <span style={{ color: C.accent }}>{lineCost.toFixed(3)}</span> : <span style={{ color: C.gray400 }}>—</span>}
                      </td>
                    )}

                    {canEdit && (
                      <td style={{ ...td, textAlign: 'center', borderBottom: isLast && !canSeePrices ? 'none' : td.borderBottom }}>
                        <button
                          onClick={() => onDelete(row.id)}
                          style={{
                            width: 24, height: 24, display: 'inline-flex', alignItems: 'center',
                            justifyContent: 'center', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: 16, color: C.gray400, borderRadius: 4, lineHeight: 1,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2' }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.gray400; e.currentTarget.style.background = 'transparent' }}
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>

          {/* Totals row */}
          {canSeePrices && allRows.length > 0 && (
            <tfoot>
              <tr style={{ background: C.gray100, borderTop: `1.5px solid ${C.border}` }}>
                <td
                  colSpan={canEdit ? 7 : 6}
                  style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: C.gray600, fontWeight: 600, letterSpacing: '0.05em' }}
                >
                  الإجمالي العام
                </td>
                <td style={{ ...tdNum, fontWeight: 700, color: C.green, borderBottom: 'none', background: C.gray100 }}>
                  {totalDI.toFixed(3)}
                </td>
                <td style={{ ...tdNum, fontWeight: 700, color: C.accent, borderBottom: 'none', background: C.gray100 }}>
                  {totalDO.toFixed(3)}
                </td>
                {canEdit && <td style={{ background: C.gray100, borderBottom: 'none' }} />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Unified add row */}
      {canEdit && (
        <div style={{ borderTop: `1px solid ${C.gray100}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 2, background: C.gray100, borderRadius: 8, padding: 3, flexShrink: 0 }}>
            {ADD_MODES.map(opt => (
              <button
                key={opt.value}
                onClick={() => setAddMode(opt.value)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: addMode === opt.value ? opt.color : 'transparent',
                  color: addMode === opt.value ? '#fff' : C.gray400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Autocomplete */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <IngredientAutocomplete
              onSelect={handleAdd}
              placeholder={
                addMode === 'both'
                  ? 'إضافة تغليف لـ Dine In & Dine Out...'
                  : addMode === 'dine_in'
                  ? 'إضافة تغليف Dine In...'
                  : 'إضافة تغليف Dine Out...'
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TypeBadge({ isSemi }: { isSemi: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
      background: isSemi ? C.goldLight : C.blueLight,
      color: isSemi ? C.gold : C.blue,
    }}>
      {isSemi ? 'BT' : 'RM'}
    </span>
  )
}

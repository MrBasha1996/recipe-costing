'use client'

import type { RecipeRowDraft, ComponentItem } from '@/types'
import { calcRowCost } from '@/lib/calculations'
import IngredientAutocomplete from '@/components/shared/IngredientAutocomplete'
import { C, MONO } from './theme'

interface Props {
  rows: RecipeRowDraft[]
  canEdit: boolean
  canSeePrices: boolean
  onQtyChange: (id: string, qty: number) => void
  onYieldChange: (id: string, yield_pct: number) => void
  onDelete: (id: string) => void
  onAdd: (item: ComponentItem) => void
}

const th: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: C.gray400,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  background: C.gray50,
}
const thNum: React.CSSProperties = { ...th, textAlign: 'left' }

const td: React.CSSProperties = {
  padding: '10px 14px',
  color: C.gray800,
  verticalAlign: 'middle',
  textAlign: 'right',
  borderBottom: `1px solid ${C.gray100}`,
  fontSize: 13,
}
const tdNum: React.CSSProperties = { ...td, fontFamily: MONO, fontSize: 12, textAlign: 'left' }

export default function RecipeFoodTable({
  rows, canEdit, canSeePrices, onQtyChange, onYieldChange, onDelete, onAdd,
}: Props) {
  const total = rows.reduce((s, r) => s + calcRowCost(r.qty, r.yield_pct, r.unit_cost), 0)

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Section pill header */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.gray50 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          letterSpacing: '0.04em', background: C.greenLight, color: C.green,
          border: `1px solid ${C.greenBorder}`,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
          Food Items — المواد الغذائية
          <span style={{ marginRight: 4, opacity: 0.6, fontSize: 11 }}>({rows.length})</span>
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1.5px solid ${C.border}` }}>
              <th style={th}>Item ID</th>
              <th style={{ ...th, textAlign: 'center' }}>Type</th>
              <th style={th}>Item Name</th>
              <th style={{ ...th, textAlign: 'center' }}>UM</th>
              <th style={thNum}>Quantity</th>
              <th style={thNum}>Yield%</th>
              {canSeePrices && <th style={thNum}>Price</th>}
              {canSeePrices && <th style={thNum}>Total</th>}
              {canEdit && <th style={{ ...th, width: 36 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6 + (canSeePrices ? 2 : 0) + (canEdit ? 1 : 0)}
                  style={{ ...td, textAlign: 'center', padding: '32px 16px', color: C.gray400, borderBottom: 'none' }}
                >
                  {canEdit ? 'أضف مادة غذائية بالأسفل' : 'لا توجد مواد غذائية'}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const lineCost = calcRowCost(row.qty, row.yield_pct, row.unit_cost)
                const isLast = i === rows.length - 1 && !canSeePrices
                return (
                  <tr
                    key={row.id}
                    style={{ background: i % 2 !== 0 ? C.gray50 : '#fff', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.gray100)}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 !== 0 ? C.gray50 : '#fff')}
                  >
                    <td style={{ ...td, borderBottom: isLast ? 'none' : td.borderBottom }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.gray400 }}>{row.ing_sku}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'center', borderBottom: isLast ? 'none' : td.borderBottom }}>
                      <TypeBadge isSemi={row.is_semi} />
                    </td>
                    <td style={{ ...td, borderBottom: isLast ? 'none' : td.borderBottom }}>
                      {row.ing_name}
                      {row.is_semi && (
                        <span style={{ marginRight: 5, fontSize: 10, color: C.gold }}>(Batch)</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 12, color: C.gray400, borderBottom: isLast ? 'none' : td.borderBottom }}>
                      {row.unit}
                    </td>
                    <td style={{ ...tdNum, borderBottom: isLast ? 'none' : td.borderBottom }}>
                      {canEdit ? (
                        <input
                          type="number"
                          value={row.qty}
                          onChange={e => onQtyChange(row.id, parseFloat(e.target.value) || 0)}
                          min={0} step={0.001}
                          style={{
                            width: 72, background: '#fff', border: `1px solid ${C.border}`,
                            borderRadius: 6, padding: '3px 6px', fontSize: 12,
                            textAlign: 'center', outline: 'none', fontFamily: MONO,
                          }}
                        />
                      ) : (
                        <span>{row.qty}</span>
                      )}
                    </td>
                    <td style={{ ...tdNum, borderBottom: isLast ? 'none' : td.borderBottom }}>
                      {canEdit ? (
                        <input
                          type="number"
                          value={row.yield_pct}
                          onChange={e => onYieldChange(row.id, parseFloat(e.target.value) || 0)}
                          min={1} max={100} step={1}
                          style={{
                            width: 60, background: '#fff', border: `1px solid ${C.border}`,
                            borderRadius: 6, padding: '3px 6px', fontSize: 12,
                            textAlign: 'center', outline: 'none', fontFamily: MONO,
                          }}
                        />
                      ) : (
                        <span style={{ color: C.gray600 }}>{row.yield_pct}%</span>
                      )}
                    </td>
                    {canSeePrices && (
                      <td style={{ ...tdNum, color: C.gray400, borderBottom: isLast ? 'none' : td.borderBottom }}>
                        {row.unit_cost.toFixed(3)}
                      </td>
                    )}
                    {canSeePrices && (
                      <td style={{ ...tdNum, fontWeight: 600, color: C.green, borderBottom: isLast ? 'none' : td.borderBottom }}>
                        {lineCost.toFixed(3)}
                      </td>
                    )}
                    {canEdit && (
                      <td style={{ ...td, textAlign: 'center', borderBottom: isLast ? 'none' : td.borderBottom }}>
                        <button
                          onClick={() => onDelete(row.id)}
                          style={{
                            width: 24, height: 24, display: 'inline-flex', alignItems: 'center',
                            justifyContent: 'center', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: 16, color: C.gray400, borderRadius: 4,
                            lineHeight: 1,
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

          {/* Totals + VAT */}
          {canSeePrices && rows.length > 0 && (
            <tfoot>
              <tr style={{ background: C.gray100, borderTop: `1.5px solid ${C.border}` }}>
                <td
                  colSpan={canEdit ? 7 : 6}
                  style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: C.gray600, fontWeight: 600, letterSpacing: '0.05em' }}
                >
                  الإجمالي العام
                </td>
                <td style={{ ...tdNum, fontWeight: 700, color: C.green, borderBottom: 'none', background: C.gray100 }}>
                  {total.toFixed(3)}
                </td>
                {canEdit && <td style={{ background: C.gray100, borderBottom: 'none' }} />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add row */}
      {canEdit && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.gray100}` }}>
          <IngredientAutocomplete onSelect={onAdd} placeholder="+ إضافة مادة غذائية..." />
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

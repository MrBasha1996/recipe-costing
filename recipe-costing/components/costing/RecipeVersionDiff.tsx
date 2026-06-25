'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BrandId } from '@/types'

interface Version {
  id: string
  version: number
  version_name: string | null
  is_active: boolean
  food_cost_pct: number | null
  total_cost: number
  sell_price: number
  saved_at: string
}

interface IngRow {
  ing_sku: string
  ing_name: string
  qty: number
  unit: string
  unit_cost: number
  yield_pct: number
  line_cost: number  // qty / (yield_pct/100) * unit_cost
  is_semi: boolean
}

type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

interface DiffRow {
  ing_sku: string
  ing_name: string
  unit: string
  is_semi: boolean
  status: DiffStatus
  oldQty: number | null; newQty: number | null
  oldCost: number | null; newCost: number | null
  oldLine: number | null; newLine: number | null
}

interface Props {
  open: boolean
  onClose: () => void
  versions: Version[]
  brand: BrandId
  productName: string
}

function loadIngredients(recipeId: string): Promise<IngRow[]> {
  const supabase = createClient()
  return (supabase.from('recipe_ingredients') as any)
    .select('ing_sku, ing_name, qty, unit, unit_cost, yield_pct, is_semi')
    .eq('recipe_id', recipeId)
    .then(({ data }: any) =>
      ((data || []) as any[]).map((r: any) => ({
        ing_sku: r.ing_sku, ing_name: r.ing_name,
        qty: r.qty, unit: r.unit, unit_cost: r.unit_cost,
        yield_pct: r.yield_pct, is_semi: r.is_semi,
        line_cost: r.yield_pct > 0 ? (r.qty / (r.yield_pct / 100)) * r.unit_cost : 0,
      }))
    )
}

function buildDiff(oldRows: IngRow[], newRows: IngRow[]): DiffRow[] {
  const oldMap = new Map(oldRows.map(r => [r.ing_sku, r]))
  const newMap = new Map(newRows.map(r => [r.ing_sku, r]))
  const allSkus = new Set([...oldMap.keys(), ...newMap.keys()])
  const result: DiffRow[] = []

  for (const sku of allSkus) {
    const o = oldMap.get(sku); const n = newMap.get(sku)
    let status: DiffStatus = 'unchanged'
    if (!o) status = 'added'
    else if (!n) status = 'removed'
    else if (Math.abs(o.qty - n.qty) > 0.0001 || Math.abs(o.unit_cost - n.unit_cost) > 0.0001) status = 'changed'

    result.push({
      ing_sku: sku,
      ing_name: (n ?? o)!.ing_name,
      unit: (n ?? o)!.unit,
      is_semi: (n ?? o)!.is_semi,
      status,
      oldQty: o?.qty ?? null, newQty: n?.qty ?? null,
      oldCost: o?.unit_cost ?? null, newCost: n?.unit_cost ?? null,
      oldLine: o?.line_cost ?? null, newLine: n?.line_cost ?? null,
    })
  }

  const order: Record<DiffStatus, number> = { added: 0, removed: 1, changed: 2, unchanged: 3 }
  return result.sort((a, b) => order[a.status] - order[b.status])
}

const STATUS_CONFIG: Record<DiffStatus, { bg: string; text: string; label: string; icon: string }> = {
  added:     { bg: 'bg-green-50',  text: 'text-green-700',  label: 'مضاف',    icon: '➕' },
  removed:   { bg: 'bg-red-50',    text: 'text-red-700',    label: 'محذوف',   icon: '➖' },
  changed:   { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'معدَّل',   icon: '✏' },
  unchanged: { bg: 'bg-white',     text: 'text-gray-400',   label: 'بدون تغيير', icon: '·' },
}

export default function RecipeVersionDiff({ open, onClose, versions, brand, productName }: Props) {
  const sorted = [...versions].sort((a, b) => a.version - b.version)
  const [oldId, setOldId] = useState('')
  const [newId, setNewId] = useState('')
  const [diff, setDiff]   = useState<DiffRow[]>([])
  const [oldV, setOldV]   = useState<Version | null>(null)
  const [newV, setNewV]   = useState<Version | null>(null)
  const [loading, setLoading] = useState(false)
  const [showUnchanged, setShowUnchanged] = useState(false)

  // إعداد القيم الافتراضية عند الفتح
  useEffect(() => {
    if (!open || sorted.length < 2) return
    setOldId(sorted[sorted.length - 2].id)
    setNewId(sorted[sorted.length - 1].id)
  }, [open])

  useEffect(() => {
    if (!oldId || !newId || oldId === newId) { setDiff([]); return }
    setLoading(true)
    Promise.all([loadIngredients(oldId), loadIngredients(newId)]).then(([o, n]) => {
      setDiff(buildDiff(o, n))
      setOldV(sorted.find(v => v.id === oldId) ?? null)
      setNewV(sorted.find(v => v.id === newId) ?? null)
      setLoading(false)
    })
  }, [oldId, newId])

  if (!open) return null

  const visible = showUnchanged ? diff : diff.filter(d => d.status !== 'unchanged')
  const added   = diff.filter(d => d.status === 'added').length
  const removed = diff.filter(d => d.status === 'removed').length
  const changed = diff.filter(d => d.status === 'changed').length

  const oldTotalCost = oldV?.total_cost ?? 0
  const newTotalCost = newV?.total_cost ?? 0
  const costDiff     = newTotalCost - oldTotalCost
  const fcDiff       = (newV?.food_cost_pct ?? 0) - (oldV?.food_cost_pct ?? 0)

  const selCls = 'border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500 bg-white'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 w-[520px] max-w-full bg-white border-l border-gray-200 z-50 flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">مقارنة الإصدارات</h3>
            <p className="text-xs text-gray-500 mt-0.5">{productName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        {/* Version selectors */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">الإصدار القديم</label>
              <select value={oldId} onChange={e => setOldId(e.target.value)} className={`${selCls} w-full`}>
                {sorted.map(v => (
                  <option key={v.id} value={v.id} disabled={v.id === newId}>
                    إصدار {v.version}{v.version_name ? ` — ${v.version_name}` : ''}{v.is_active ? ' ✓' : ''}
                  </option>
                ))}
              </select>
              {oldV && <div className="text-[10px] text-gray-400 mt-1 font-mono">تكلفة: {(oldV.total_cost ?? 0).toFixed(3)} · FC: {(oldV.food_cost_pct ?? 0).toFixed(1)}%</div>}
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">الإصدار الجديد</label>
              <select value={newId} onChange={e => setNewId(e.target.value)} className={`${selCls} w-full`}>
                {sorted.map(v => (
                  <option key={v.id} value={v.id} disabled={v.id === oldId}>
                    إصدار {v.version}{v.version_name ? ` — ${v.version_name}` : ''}{v.is_active ? ' ✓' : ''}
                  </option>
                ))}
              </select>
              {newV && <div className="text-[10px] text-gray-400 mt-1 font-mono">تكلفة: {(newV.total_cost ?? 0).toFixed(3)} · FC: {(newV.food_cost_pct ?? 0).toFixed(1)}%</div>}
            </div>
          </div>
        </div>

        {/* Summary bar */}
        {!loading && diff.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-4 flex-wrap text-xs">
            {added > 0   && <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">➕ {added} مضاف</span>}
            {removed > 0 && <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">➖ {removed} محذوف</span>}
            {changed > 0 && <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">✏ {changed} معدَّل</span>}
            {added === 0 && removed === 0 && changed === 0 && (
              <span className="text-gray-400">لا تغييرات في المكونات</span>
            )}

            {/* Cost/FC summary */}
            <div className="ms-auto flex items-center gap-3 text-[11px]">
              <span className={costDiff >= 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                التكلفة {costDiff >= 0 ? '+' : ''}{costDiff.toFixed(3)} ر.س
              </span>
              <span className={fcDiff >= 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                FC% {fcDiff >= 0 ? '+' : ''}{fcDiff.toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {/* Diff table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">جارٍ المقارنة...</div>
          ) : sorted.length < 2 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">يحتاج إصدارَين على الأقل</div>
          ) : diff.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">اختر إصدارَين للمقارنة</div>
          ) : (
            <table suppressHydrationWarning className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr className="text-gray-500">
                  <th className="text-right px-4 py-2.5 font-medium">المكوّن</th>
                  <th className="text-center px-3 py-2.5 font-medium">الكمية</th>
                  <th className="text-center px-3 py-2.5 font-medium">التكلفة/وحدة</th>
                  <th className="text-center px-3 py-2.5 font-medium">الخط</th>
                  <th className="text-center px-3 py-2.5 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d, i) => {
                  const cfg = STATUS_CONFIG[d.status]
                  return (
                    <tr key={d.ing_sku} className={`border-b border-gray-50 last:border-0 ${cfg.bg}`}>
                      <td className="px-4 py-2.5">
                        <div className={`font-medium ${d.status === 'removed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {d.ing_name}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-gray-400 font-mono">{d.unit}</span>
                          {d.is_semi && <span className="text-[9px] bg-purple-100 text-purple-700 px-1 rounded">باتش</span>}
                        </div>
                      </td>

                      {/* الكمية */}
                      <td className="px-3 py-2.5 text-center">
                        {d.status === 'unchanged' ? (
                          <span className="font-mono text-gray-500">{d.newQty?.toFixed(3)}</span>
                        ) : d.status === 'added' ? (
                          <span className="font-mono font-semibold text-green-700">{d.newQty?.toFixed(3)}</span>
                        ) : d.status === 'removed' ? (
                          <span className="font-mono text-red-400 line-through">{d.oldQty?.toFixed(3)}</span>
                        ) : (
                          <div>
                            <div className="font-mono text-gray-400 line-through text-[10px]">{d.oldQty?.toFixed(3)}</div>
                            <div className={`font-mono font-semibold ${(d.newQty ?? 0) > (d.oldQty ?? 0) ? 'text-red-600' : 'text-green-600'}`}>
                              {d.newQty?.toFixed(3)}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* التكلفة/وحدة */}
                      <td className="px-3 py-2.5 text-center">
                        {d.status === 'unchanged' ? (
                          <span className="font-mono text-gray-500">{d.newCost?.toFixed(3)}</span>
                        ) : d.status === 'added' ? (
                          <span className="font-mono font-semibold text-green-700">{d.newCost?.toFixed(3)}</span>
                        ) : d.status === 'removed' ? (
                          <span className="font-mono text-red-400 line-through">{d.oldCost?.toFixed(3)}</span>
                        ) : (
                          <div>
                            <div className="font-mono text-gray-400 line-through text-[10px]">{d.oldCost?.toFixed(3)}</div>
                            <div className={`font-mono font-semibold ${(d.newCost ?? 0) > (d.oldCost ?? 0) ? 'text-red-600' : 'text-green-600'}`}>
                              {d.newCost?.toFixed(3)}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* تكلفة الخط */}
                      <td className="px-3 py-2.5 text-center">
                        {d.status === 'unchanged' ? (
                          <span className="font-mono text-gray-500">{d.newLine?.toFixed(3)}</span>
                        ) : d.status === 'added' ? (
                          <span className="font-mono font-semibold text-green-700">{d.newLine?.toFixed(3)}</span>
                        ) : d.status === 'removed' ? (
                          <span className="font-mono text-red-400 line-through">{d.oldLine?.toFixed(3)}</span>
                        ) : (
                          <div>
                            <div className="font-mono text-gray-400 line-through text-[10px]">{d.oldLine?.toFixed(3)}</div>
                            <div className={`font-mono font-semibold ${(d.newLine ?? 0) > (d.oldLine ?? 0) ? 'text-red-600' : 'text-green-600'}`}>
                              {d.newLine?.toFixed(3)}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* الحالة */}
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[10px] font-semibold ${cfg.text}`}>{cfg.icon} {cfg.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {diff.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showUnchanged} onChange={e => setShowUnchanged(e.target.checked)}
                className="accent-blue-500 w-3 h-3" />
              عرض المكونات بدون تغيير ({diff.filter(d => d.status === 'unchanged').length})
            </label>
            <button onClick={onClose} className="text-xs px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg">
              إغلاق
            </button>
          </div>
        )}
      </div>
    </>
  )
}

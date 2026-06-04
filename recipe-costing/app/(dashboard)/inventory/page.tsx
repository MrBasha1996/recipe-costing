'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import type { MovementType, StockMovement } from '@/types'

// ── Types ─────────────────────────────────────────────────────────

interface InventoryItem {
  sku: string
  name: string
  unit: string
  type: 'ingredient' | 'batch'
  stock_id: string | null
  current_qty: number
  min_qty: number
}

type Tab = 'stock' | 'add' | 'history' | 'stocktake'

interface StocktakeSession {
  id: string
  session_date: string
  notes: string | null
  status: 'open' | 'finalized'
  created_at: string
  finalized_at: string | null
}

interface StocktakeItem {
  id: string
  ing_sku: string
  ing_name: string
  unit: string
  item_type: 'ingredient' | 'batch'
  theoretical_qty: number
  actual_qty: number
  unit_cost: number
}

// ── Helpers ───────────────────────────────────────────────────────

function stockStatus(item: InventoryItem): 'ok' | 'low' | 'empty' {
  if (item.current_qty <= 0) return 'empty'
  if (item.current_qty <= item.min_qty) return 'low'
  return 'ok'
}

function statusBadge(s: ReturnType<typeof stockStatus>) {
  if (s === 'ok') return 'bg-green-50 text-green-700'
  if (s === 'low') return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

function statusLabel(s: ReturnType<typeof stockStatus>) {
  if (s === 'ok') return 'كافٍ'
  if (s === 'low') return 'منخفض'
  return 'نفد'
}

function movementLabel(t: MovementType) {
  if (t === 'in') return 'استلام'
  if (t === 'out') return 'صرف'
  if (t === 'waste') return 'هالك'
  return 'تسوية'
}

function movementColor(t: MovementType) {
  if (t === 'in') return 'text-green-600'
  if (t === 'out') return 'text-blue-600'
  if (t === 'waste') return 'text-red-600'
  return 'text-amber-600'
}

// ── Main Page ─────────────────────────────────────────────────────

export default function InventoryPage() {
  const { brand, hydrated } = useBrandStore()
  const { isAccountant, canEdit } = useUserStore()
  const isAcct = isAccountant()
  const canE = canEdit('inventory')

  const [tab, setTab] = useState<Tab>('stock')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [{ data: ings }, { data: batches }, { data: stockRows }, { data: moves }] = await Promise.all([
      (supabase.from('ingredients') as any)
        .select('sku, name, unit')
        .eq('brand_id', brand),
      (supabase.from('products') as any)
        .select('sku, name, unit')
        .eq('brand_id', brand)
        .or('is_semi.eq.true,category.eq.Batch'),
      (supabase.from('stock_items') as any)
        .select('id, ing_sku, current_qty, min_qty')
        .eq('brand_id', brand),
      (supabase.from('stock_movements') as any)
        .select('*')
        .eq('brand_id', brand)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    // Build stock map: sku → stock row
    const stockMap = new Map<string, { id: string; current_qty: number; min_qty: number }>()
    for (const s of (stockRows || []) as any[]) {
      stockMap.set(s.ing_sku, { id: s.id, current_qty: s.current_qty, min_qty: s.min_qty })
    }

    const merged: InventoryItem[] = [
      ...((ings || []) as any[]).map((i: any) => {
        const s = stockMap.get(i.sku)
        return {
          sku: i.sku, name: i.name, unit: i.unit ?? '—', type: 'ingredient' as const,
          stock_id: s?.id ?? null, current_qty: s?.current_qty ?? 0, min_qty: s?.min_qty ?? 0,
        }
      }),
      ...((batches || []) as any[]).map((b: any) => {
        const s = stockMap.get(b.sku)
        return {
          sku: b.sku, name: b.name, unit: b.unit ?? '—', type: 'batch' as const,
          stock_id: s?.id ?? null, current_qty: s?.current_qty ?? 0, min_qty: s?.min_qty ?? 0,
        }
      }),
    ]

    // Sort: low/empty first, then by name
    merged.sort((a, b) => {
      const order = { empty: 0, low: 1, ok: 2 }
      const diff = order[stockStatus(a)] - order[stockStatus(b)]
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ar')
    })

    setItems(merged)
    setMovements((moves as StockMovement[]) || [])
    setLoading(false)
  }, [brand])

  useEffect(() => {
    if (!hydrated) return
    loadAll()
  }, [loadAll, hydrated])

  const lowCount = items.filter(i => stockStatus(i) !== 'ok').length

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">إدارة المخزون</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {items.length} صنف
          {lowCount > 0 && <span className="text-amber-600 mr-2">· {lowCount} تحتاج انتباه</span>}
        </p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {([['stock', 'المخزون الحالي'], ['add', 'إضافة حركة'], ['history', 'سجل الحركات'], ['stocktake', 'الجرد الدوري']] as [Tab, string][]).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {!hydrated || loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">جارٍ التحميل...</div>
      ) : (
        <>
          {tab === 'stock' && (
            <StockTab items={items} canE={canE} brand={brand as import('@/types').BrandId} onRefresh={loadAll} />
          )}
          {tab === 'add' && (
            <AddMovementTab items={items} brand={brand as import('@/types').BrandId} onSaved={loadAll} />
          )}
          {tab === 'history' && (
            <HistoryTab movements={movements} />
          )}
          {tab === 'stocktake' && (
            <StocktakeTab brand={brand as import('@/types').BrandId} items={items} />
          )}
        </>
      )}
    </div>
  )
}

// ── Tab 1: Current Stock ─────────────────────────────────────────

function StockTab({ items, canE, brand, onRefresh }: {
  items: InventoryItem[]
  canE: boolean
  brand: import('@/types').BrandId
  onRefresh: () => void
}) {
  const [editingSku, setEditingSku] = useState<string | null>(null)
  const [editMin, setEditMin] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'ingredient' | 'batch'>('all')

  const filtered = items.filter(i => {
    if (typeFilter !== 'all' && i.type !== typeFilter) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function saveMinQty(item: InventoryItem) {
    setSaving(true)
    const supabase = createClient()
    await (supabase.from('stock_items') as any).upsert({
      brand_id: brand,
      ing_sku: item.sku,
      ing_name: item.name,
      unit: item.unit,
      current_qty: item.current_qty,
      min_qty: Number(editMin) || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'brand_id,ing_sku' })
    setSaving(false)
    setEditingSku(null)
    onRefresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text" placeholder="بحث..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-44"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {([['all', 'الكل'], ['ingredient', 'مواد خام'], ['batch', 'باتش']] as ['all' | 'ingredient' | 'batch', string][]).map(([v, l]) => (
            <button key={v} onClick={() => setTypeFilter(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${typeFilter === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} صنف</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-gray-400 text-sm">
          لا توجد أصناف
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right bg-gray-50">
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">الصنف</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الكمية الحالية</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الحد الأدنى</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الحالة</th>
                {canE && <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">تعديل</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const st = stockStatus(item)
                const editing = editingSku === item.sku
                return (
                  <tr key={item.sku} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          item.type === 'batch' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {item.type === 'batch' ? 'باتش' : 'خام'}
                        </span>
                        <div>
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{item.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-mono font-bold ${st === 'empty' ? 'text-red-600' : st === 'low' ? 'text-amber-600' : 'text-gray-900'}`}>
                        {item.current_qty.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-400 mr-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editing ? (
                        <input
                          type="number" value={editMin} onChange={e => setEditMin(e.target.value)}
                          className="w-20 bg-white border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-900 text-center"
                        />
                      ) : (
                        <span className="font-mono text-gray-600">{item.min_qty.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(st)}`}>
                        {statusLabel(st)}
                      </span>
                    </td>
                    {canE && (
                      <td className="px-4 py-3 text-center">
                        {editing ? (
                          <div className="flex items-center gap-1 justify-center">
                            <button onClick={() => saveMinQty(item)} disabled={saving}
                              className="text-xs px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded">
                              {saving ? '...' : 'حفظ'}
                            </button>
                            <button onClick={() => setEditingSku(null)}
                              className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded">
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingSku(item.sku); setEditMin(String(item.min_qty)) }}
                            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            ✏
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Add Movement ──────────────────────────────────────────

function AddMovementTab({ items, brand, onSaved }: {
  items: InventoryItem[]
  brand: import('@/types').BrandId
  onSaved: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [movType, setMovType] = useState<MovementType>('in')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const filtered = search.length >= 1
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
    : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !qty) return
    setSaving(true); setMsg(null)
    const numQty = Number(qty)
    if (isNaN(numQty) || numQty <= 0) {
      setMsg({ ok: false, text: 'الكمية يجب أن تكون أكبر من صفر' }); setSaving(false); return
    }
    const supabase = createClient()
    const user = (await supabase.auth.getUser()).data.user
    const delta = movType === 'in' || movType === 'adjustment' ? numQty : -numQty
    const newQty = Math.max(0, selected.current_qty + delta)

    const { error: movErr } = await (supabase.from('stock_movements') as any).insert({
      brand_id: brand, ing_sku: selected.sku, ing_name: selected.name,
      movement_type: movType, qty: numQty, note: note || null,
      performed_by: user?.id ?? null,
    })
    if (movErr) { setMsg({ ok: false, text: movErr.message }); setSaving(false); return }

    // Upsert stock_items — creates row automatically if it doesn't exist
    await (supabase.from('stock_items') as any).upsert({
      brand_id: brand, ing_sku: selected.sku, ing_name: selected.name,
      unit: selected.unit, current_qty: newQty, min_qty: selected.min_qty,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'brand_id,ing_sku' })

    setMsg({ ok: true, text: 'تمت الإضافة ✓' })
    setQty(''); setNote(''); setSelected(null); setSearch('')
    setSaving(false); onSaved()
  }

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="text-sm font-semibold text-gray-900">تسجيل حركة مخزون</div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">الصنف</label>
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث بالاسم..."
              value={selected ? selected.name : search}
              onChange={e => { setSearch(e.target.value); setSelected(null) }}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            {filtered.length > 0 && !selected && (
              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {filtered.map(item => (
                  <button
                    key={item.sku} type="button"
                    onClick={() => { setSelected(item); setSearch('') }}
                    className="w-full text-right px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                        item.type === 'batch' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {item.type === 'batch' ? 'باتش' : 'خام'}
                      </span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                      {item.current_qty.toFixed(2)} {item.unit}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
              <span className={`font-semibold px-1.5 py-0.5 rounded ${
                selected.type === 'batch' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
              }`}>
                {selected.type === 'batch' ? 'باتش' : 'خام'}
              </span>
              <span>الكمية الحالية: <span className="font-mono font-bold text-gray-800">{selected.current_qty.toFixed(2)} {selected.unit}</span></span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">نوع الحركة</label>
          <div className="grid grid-cols-4 gap-1">
            {(['in', 'out', 'waste', 'adjustment'] as MovementType[]).map(t => (
              <button key={t} type="button" onClick={() => setMovType(t)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  movType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {movementLabel(t)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">
            الكمية{selected && <span className="text-gray-400 mr-1">({selected.unit})</span>}
          </label>
          <input
            type="number" step="0.001" min="0.001" value={qty}
            onChange={e => setQty(e.target.value)} placeholder="0.000" required
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">ملاحظة (اختياري)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="سبب الحركة..."
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {msg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        <button type="submit" disabled={saving || !selected || !qty}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors">
          {saving ? 'جارٍ الحفظ...' : 'تسجيل الحركة'}
        </button>
      </form>
    </div>
  )
}

// ── Tab 3: History ────────────────────────────────────────────────

function HistoryTab({ movements }: { movements: StockMovement[] }) {
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all')
  const [search, setSearch] = useState('')

  const filtered = movements.filter(m => {
    if (typeFilter !== 'all' && m.movement_type !== typeFilter) return false
    if (search && !m.ing_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input type="text" placeholder="بحث بالصنف..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-44"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'in', 'out', 'waste', 'adjustment'] as (MovementType | 'all')[]).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'all' ? 'الكل' : movementLabel(t as MovementType)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} حركة</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-gray-400 text-sm">
          لا توجد حركات بعد
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right bg-gray-50">
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">التاريخ</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">الصنف</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">النوع</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الكمية</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleDateString('ar-SA')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.ing_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{m.ing_sku}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold ${movementColor(m.movement_type)}`}>
                      {movementLabel(m.movement_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-gray-700">
                    {m.movement_type === 'out' || m.movement_type === 'waste' ? '-' : '+'}{m.qty}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 4: Stocktake ──────────────────────────────────────────────

function StocktakeTab({ brand, items }: {
  brand: import('@/types').BrandId
  items: InventoryItem[]
}) {
  const [sessions, setSessions] = useState<StocktakeSession[]>([])
  const [activeSession, setActiveSession] = useState<StocktakeSession | null>(null)
  const [sessionItems, setSessionItems] = useState<StocktakeItem[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    const supabase = createClient()
    const { data } = await (supabase.from('stocktake_sessions') as any)
      .select('*').eq('brand_id', brand).order('session_date', { ascending: false })
    setSessions((data || []) as StocktakeSession[])
    setLoadingSessions(false)
  }, [brand])

  useEffect(() => { loadSessions() }, [loadSessions])

  async function loadSessionItems(sessionId: string) {
    setLoadingItems(true)
    const supabase = createClient()
    const { data } = await (supabase.from('stocktake_items') as any)
      .select('*').eq('session_id', sessionId).order('ing_name')
    setSessionItems((data || []) as StocktakeItem[])
    setLoadingItems(false)
  }

  async function handleStartSession() {
    setSaving(true)
    const supabase = createClient()
    const user = (await supabase.auth.getUser()).data.user
    const { data: session, error } = await (supabase.from('stocktake_sessions') as any)
      .insert({ brand_id: brand, session_date: newDate, notes: newNotes || null, created_by: user?.id })
      .select().single()
    if (error) { setSaving(false); return }

    const [{ data: ings }, { data: batches }] = await Promise.all([
      (supabase.from('ingredients') as any).select('sku, cost').eq('brand_id', brand),
      (supabase.from('products') as any).select('sku, price').eq('brand_id', brand).or('is_semi.eq.true,category.eq.Batch'),
    ])
    const costMap = new Map<string, number>()
    for (const i of (ings || []) as any[]) costMap.set(i.sku, i.cost ?? 0)
    for (const b of (batches || []) as any[]) costMap.set(b.sku, b.price ?? 0)

    const rows = items.map(i => ({
      session_id: session.id, ing_sku: i.sku, ing_name: i.name, unit: i.unit,
      item_type: i.type, theoretical_qty: i.current_qty,
      actual_qty: i.current_qty, unit_cost: costMap.get(i.sku) ?? 0,
    }))
    await (supabase.from('stocktake_items') as any).insert(rows)
    setSaving(false); setShowNewForm(false); setNewNotes('')
    setActiveSession(session as StocktakeSession)
    await loadSessionItems(session.id)
    await loadSessions()
  }

  async function handleSaveActual() {
    if (!activeSession) return
    setSaving(true)
    const supabase = createClient()
    for (const item of sessionItems) {
      await (supabase.from('stocktake_items') as any).update({ actual_qty: item.actual_qty }).eq('id', item.id)
    }
    setSaving(false)
    setMsg({ ok: true, text: 'تم الحفظ ✓' })
    setTimeout(() => setMsg(null), 3000)
  }

  async function handleFinalize() {
    if (!activeSession || !confirm('إنهاء الجرد وتحديث المخزون بالكميات الفعلية؟')) return
    setSaving(true)
    const supabase = createClient()
    for (const item of sessionItems) {
      await (supabase.from('stocktake_items') as any).update({ actual_qty: item.actual_qty }).eq('id', item.id)
    }
    const note = `جرد دوري — ${activeSession.session_date}`
    for (const item of sessionItems) {
      const variance = item.actual_qty - item.theoretical_qty
      if (Math.abs(variance) < 0.001) continue
      await (supabase.from('stock_items') as any).upsert({
        brand_id: brand, ing_sku: item.ing_sku, ing_name: item.ing_name,
        unit: item.unit, current_qty: item.actual_qty, min_qty: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'brand_id,ing_sku' })
      await (supabase.from('stock_movements') as any).insert({
        brand_id: brand, ing_sku: item.ing_sku, ing_name: item.ing_name,
        movement_type: 'adjustment', qty: Math.abs(variance), note, performed_by: null,
      })
    }
    await (supabase.from('stocktake_sessions') as any)
      .update({ status: 'finalized', finalized_at: new Date().toISOString() })
      .eq('id', activeSession.id)
    setSaving(false); setActiveSession(null); setSessionItems([])
    await loadSessions()
    setMsg({ ok: true, text: 'تم إنهاء الجرد وتحديث المخزون ✓' })
    setTimeout(() => setMsg(null), 4000)
  }

  if (activeSession) {
    const filtered = search
      ? sessionItems.filter(i => i.ing_name.toLowerCase().includes(search.toLowerCase()))
      : sessionItems
    const totalVariance = sessionItems.reduce((s, i) => s + (i.actual_qty - i.theoretical_qty) * i.unit_cost, 0)
    const variantCount = sessionItems.filter(i => Math.abs(i.actual_qty - i.theoretical_qty) > 0.001).length

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">جرد {new Date(activeSession.session_date).toLocaleDateString('ar-SA')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{sessionItems.length} صنف · {variantCount} لديه فرق</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`text-sm font-mono font-bold px-3 py-1 rounded-lg ${totalVariance < 0 ? 'bg-red-50 text-red-700' : totalVariance > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
              {totalVariance >= 0 ? '+' : ''}{totalVariance.toFixed(2)} ر.س
            </div>
            {activeSession.status === 'open' && <>
              <button onClick={handleSaveActual} disabled={saving}
                className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40">
                {saving ? '...' : '💾 حفظ'}
              </button>
              <button onClick={handleFinalize} disabled={saving}
                className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-40">
                ✓ إنهاء الجرد
              </button>
            </>}
            <button onClick={() => setActiveSession(null)}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
              رجوع
            </button>
          </div>
        </div>
        {msg && <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
        <input type="text" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-blue-500"
        />
        {loadingItems ? (
          <div className="text-center py-12 text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <th className="text-right px-4 py-3 font-medium">الصنف</th>
                  <th className="px-4 py-3 font-medium text-center">نظري</th>
                  <th className="px-4 py-3 font-medium text-center">فعلي</th>
                  <th className="px-4 py-3 font-medium text-center">الفرق</th>
                  <th className="px-4 py-3 font-medium text-center">قيمة الفرق</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const variance = item.actual_qty - item.theoretical_qty
                  const vValue = variance * item.unit_cost
                  const hasV = Math.abs(variance) > 0.001
                  return (
                    <tr key={item.id} className={`border-b border-gray-100 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${item.item_type === 'batch' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                            {item.item_type === 'batch' ? 'باتش' : 'خام'}
                          </span>
                          <span className="font-medium text-gray-900">{item.ing_name}</span>
                          <span className="text-xs text-gray-400">{item.unit}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-600 text-xs">{item.theoretical_qty.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="number" step="0.001" min="0" value={item.actual_qty}
                          disabled={activeSession.status === 'finalized'}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v >= 0)
                              setSessionItems(prev => prev.map(i => i.id === item.id ? { ...i, actual_qty: v } : i))
                          }}
                          className="w-24 text-center bg-white border border-gray-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                        />
                      </td>
                      <td className={`px-4 py-2.5 text-center font-mono text-xs font-semibold ${!hasV ? 'text-gray-400' : variance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {hasV ? `${variance >= 0 ? '+' : ''}${variance.toFixed(3)}` : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-mono text-xs font-semibold ${!hasV ? 'text-gray-400' : vValue < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {hasV ? `${vValue >= 0 ? '+' : ''}${vValue.toFixed(2)} ر.س` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {msg && <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">الجرد الدوري</h2>
        <button onClick={() => setShowNewForm(v => !v)}
          className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
          + بدء جرد جديد
        </button>
      </div>
      {showNewForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-gray-900">جرد جديد</div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">تاريخ الجرد</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs text-gray-500">ملاحظات (اختياري)</label>
              <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
                placeholder="مثال: جرد نهاية الشهر"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleStartSession} disabled={saving}
              className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40">
              {saving ? 'جارٍ الإنشاء...' : `بدء الجرد (${items.length} صنف)`}
            </button>
            <button onClick={() => setShowNewForm(false)}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
              إلغاء
            </button>
          </div>
        </div>
      )}
      {loadingSessions ? (
        <div className="text-center py-12 text-gray-400 text-sm">جارٍ التحميل...</div>
      ) : sessions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-gray-400 text-sm">
          لا توجد جردات سابقة — ابدأ جرداً جديداً
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">الملاحظات</th>
                <th className="px-4 py-3 font-medium text-center">الحالة</th>
                <th className="px-4 py-3 font-medium text-center"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{new Date(s.session_date).toLocaleDateString('ar-SA')}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.notes ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'finalized' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {s.status === 'finalized' ? 'منتهي' : 'مفتوح'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={async () => { setActiveSession(s); await loadSessionItems(s.id) }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      {s.status === 'finalized' ? 'عرض' : 'متابعة'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

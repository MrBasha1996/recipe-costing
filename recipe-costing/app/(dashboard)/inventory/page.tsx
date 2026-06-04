'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import type { StockItem, StockMovement, MovementType } from '@/types'

// ── Types ─────────────────────────────────────────────────────────

/** Represents either a raw ingredient or a batch product usable in stock */
interface SearchItem {
  sku: string
  name: string
  unit: string
  type: 'ingredient' | 'batch'
}

type Tab = 'stock' | 'add' | 'history'

// ── Helpers ───────────────────────────────────────────────────────

function stockStatus(item: StockItem): 'ok' | 'low' | 'empty' {
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
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data: items }, { data: moves }] = await Promise.all([
      (supabase.from('stock_items') as any)
        .select('*')
        .eq('brand_id', brand)
        .order('ing_name'),
      (supabase.from('stock_movements') as any)
        .select('*')
        .eq('brand_id', brand)
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    setStockItems((items as StockItem[]) || [])
    setMovements((moves as StockMovement[]) || [])
    setLoading(false)
  }, [brand])

  // Wait for hydration before fetching — avoids loading 'ti' data when user is on 'bb'
  useEffect(() => {
    if (!hydrated) return
    loadAll()
  }, [loadAll, hydrated])

  const lowCount = stockItems.filter(i => stockStatus(i) !== 'ok').length

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">إدارة المخزون</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {stockItems.length} صنف
          {lowCount > 0 && <span className="text-amber-600 mr-2">· {lowCount} تحتاج انتباه</span>}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {([['stock', 'المخزون الحالي'], ['add', 'إضافة حركة'], ['history', 'سجل الحركات']] as [Tab, string][]).map(([v, l]) => (
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
            <StockTab
              items={stockItems}
              isAcct={isAcct}
              canE={canE}
              brand={brand as import('@/types').BrandId}
              onRefresh={loadAll}
            />
          )}
          {tab === 'add' && (
            <AddMovementTab
              stockItems={stockItems}
              brand={brand as import('@/types').BrandId}
              onSaved={loadAll}
            />
          )}
          {tab === 'history' && (
            <HistoryTab movements={movements} />
          )}
        </>
      )}
    </div>
  )
}

// ── Tab 1: Current Stock ─────────────────────────────────────────

function StockTab({
  items, isAcct, canE, brand, onRefresh,
}: {
  items: StockItem[]
  isAcct: boolean
  canE: boolean
  brand: import('@/types').BrandId
  onRefresh: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editMin, setEditMin] = useState('')
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  async function saveEdit(item: StockItem) {
    setSaving(true)
    const supabase = createClient()
    await (supabase.from('stock_items') as any)
      .update({ current_qty: Number(editQty) || 0, min_qty: Number(editMin) || 0, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    setSaving(false)
    setEditingId(null)
    onRefresh()
  }

  return (
    <div className="space-y-3">
      {isAcct && (
        <div className="flex justify-end">
          <button
            onClick={() => setAddOpen(v => !v)}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            + إضافة صنف
          </button>
        </div>
      )}
      {addOpen && isAcct && (
        <AddStockItemForm brand={brand} onSaved={() => { setAddOpen(false); onRefresh() }} />
      )}
      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-gray-400 text-sm">
          لا توجد أصناف في المخزون بعد
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
              {items.map(item => {
                const st = stockStatus(item)
                const editing = editingId === item.id
                return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.ing_name}</div>
                      <div className="text-xs text-gray-400 font-mono">{item.ing_sku}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editing ? (
                        <input
                          type="number"
                          value={editQty}
                          onChange={e => setEditQty(e.target.value)}
                          className="w-20 bg-white border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-900 text-center"
                        />
                      ) : (
                        <span className={`font-mono font-bold ${st === 'empty' ? 'text-red-600' : st === 'low' ? 'text-amber-600' : 'text-gray-900'}`}>
                          {item.current_qty.toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 mr-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editing ? (
                        <input
                          type="number"
                          value={editMin}
                          onChange={e => setEditMin(e.target.value)}
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
                            <button
                              onClick={() => saveEdit(item)}
                              disabled={saving}
                              className="text-xs px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded"
                            >
                              {saving ? '...' : 'حفظ'}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingId(item.id); setEditQty(String(item.current_qty)); setEditMin(String(item.min_qty)) }}
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

// ── Add stock item form ───────────────────────────────────────────

function AddStockItemForm({ brand, onSaved }: { brand: import('@/types').BrandId; onSaved: () => void }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SearchItem[]>([])
  const [selected, setSelected] = useState<SearchItem | null>(null)
  const [minQty, setMinQty] = useState('0')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const supabase = createClient()
      const q = `%${search}%`

      const [{ data: ings }, { data: batches }] = await Promise.all([
        // Raw ingredients
        (supabase.from('ingredients') as any)
          .select('sku, name, unit')
          .eq('brand_id', brand)
          .ilike('name', q)
          .limit(8),
        // Batch / semi products
        (supabase.from('products') as any)
          .select('sku, name, unit')
          .eq('brand_id', brand)
          .or('is_semi.eq.true,category.eq.Batch')
          .ilike('name', q)
          .limit(8),
      ])

      const combined: SearchItem[] = [
        ...((ings || []) as any[]).map((i: any) => ({ sku: i.sku, name: i.name, unit: i.unit ?? '—', type: 'ingredient' as const })),
        ...((batches || []) as any[]).map((b: any) => ({ sku: b.sku, name: b.name, unit: b.unit ?? '—', type: 'batch' as const })),
      ]
      setResults(combined)
    }, 250)
    return () => clearTimeout(t)
  }, [search, brand])

  async function handleSave() {
    if (!selected) return
    setSaving(true); setErr('')
    const supabase = createClient()
    const { error } = await (supabase.from('stock_items') as any).upsert({
      brand_id: brand,
      ing_sku: selected.sku,
      ing_name: selected.name,
      unit: selected.unit,
      current_qty: 0,
      min_qty: Number(minQty) || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'brand_id,ing_sku' })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="text-sm font-medium text-gray-900">إضافة صنف للمخزون</div>
      <div className="text-xs text-gray-500">يمكن إضافة مواد خام أو باتشات</div>

      <div className="relative">
        <input
          type="text"
          placeholder="ابحث بالاسم (مادة خام أو باتش)..."
          value={selected ? selected.name : search}
          onChange={e => { setSearch(e.target.value); setSelected(null) }}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
        {results.length > 0 && !selected && (
          <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {results.map(item => (
              <button
                key={`${item.type}-${item.sku}`}
                onClick={() => { setSelected(item); setSearch(''); setResults([]) }}
                className="w-full text-right px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                    item.type === 'batch'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {item.type === 'batch' ? 'باتش' : 'خام'}
                  </span>
                  <span className="truncate">{item.name}</span>
                </div>
                <span className="text-xs text-gray-400 font-mono flex-shrink-0">{item.unit}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-semibold px-2 py-0.5 rounded ${
            selected.type === 'batch' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
          }`}>
            {selected.type === 'batch' ? 'باتش' : 'مادة خام'}
          </span>
          <span className="text-gray-500 font-mono">{selected.sku}</span>
          <span className="text-gray-400">· {selected.unit}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500">الحد الأدنى</label>
        <input
          type="number"
          value={minQty}
          onChange={e => setMinQty(e.target.value)}
          className="w-24 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
        />
        {selected && <span className="text-xs text-gray-400">{selected.unit}</span>}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={!selected || saving}
        className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40 transition-colors"
      >
        {saving ? '...' : 'إضافة'}
      </button>
    </div>
  )
}

// ── Tab 2: Add Movement ──────────────────────────────────────────

function AddMovementTab({ stockItems, brand, onSaved }: {
  stockItems: StockItem[]
  brand: import('@/types').BrandId
  onSaved: () => void
}) {
  const [selectedSku, setSelectedSku] = useState('')
  const [movType, setMovType] = useState<MovementType>('in')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const selectedItem = stockItems.find(i => i.ing_sku === selectedSku)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedItem || !qty) return
    setSaving(true); setMsg(null)
    const numQty = Number(qty)
    if (isNaN(numQty) || numQty <= 0) {
      setMsg({ ok: false, text: 'الكمية يجب أن تكون أكبر من صفر' }); setSaving(false); return
    }
    const supabase = createClient()
    const profile = (await supabase.auth.getUser()).data.user
    const delta = movType === 'in' || movType === 'adjustment' ? numQty : -numQty
    const { error: movErr } = await (supabase.from('stock_movements') as any).insert({
      brand_id: brand, ing_sku: selectedItem.ing_sku, ing_name: selectedItem.ing_name,
      movement_type: movType, qty: numQty, note: note || null,
      performed_by: profile?.id ?? null,
    })
    if (movErr) { setMsg({ ok: false, text: movErr.message }); setSaving(false); return }
    await (supabase.from('stock_items') as any)
      .update({ current_qty: Math.max(0, selectedItem.current_qty + delta), updated_at: new Date().toISOString() })
      .eq('id', selectedItem.id)
    setMsg({ ok: true, text: 'تمت الإضافة ✓' }); setQty(''); setNote(''); setSaving(false); onSaved()
  }

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="text-sm font-semibold text-gray-900">تسجيل حركة مخزون</div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">الصنف</label>
          <select
            value={selectedSku}
            onChange={e => setSelectedSku(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
            required
          >
            <option value="">اختر صنفاً...</option>
            {stockItems.map(i => (
              <option key={i.ing_sku} value={i.ing_sku}>
                {i.ing_name} ({i.current_qty.toFixed(2)} {i.unit})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">نوع الحركة</label>
          <div className="grid grid-cols-4 gap-1">
            {(['in', 'out', 'waste', 'adjustment'] as MovementType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setMovType(t)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  movType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {movementLabel(t)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">
            الكمية{selectedItem && <span className="text-gray-400 mr-1">({selectedItem.unit})</span>}
          </label>
          <input
            type="number" step="0.001" min="0.001" value={qty}
            onChange={e => setQty(e.target.value)} placeholder="0.000" required
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">ملاحظة (اختياري)</label>
          <input
            type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="سبب الحركة..."
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {msg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        <button
          type="submit" disabled={saving || !selectedSku || !qty}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
        >
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
        <input
          type="text" placeholder="بحث بالصنف..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-44"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'in', 'out', 'waste', 'adjustment'] as (MovementType | 'all')[]).map(t => (
            <button
              key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
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
                    {new Date(m.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                    <div className="text-gray-400">
                      {new Date(m.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900 font-medium">{m.ing_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{m.ing_sku}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${movementColor(m.movement_type)}`}>
                      {movementLabel(m.movement_type)}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-center font-mono font-bold text-sm ${movementColor(m.movement_type)}`}>
                    {m.movement_type === 'out' || m.movement_type === 'waste' ? '-' : '+'}
                    {m.qty.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {m.note || <span className="text-gray-300">—</span>}
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

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { useGlobalLoading } from '@/contexts/globalLoading'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { MovementType, StockMovement, BrandId } from '@/types'

interface InventoryItem {
  sku: string; name: string; unit: string; type: 'ingredient' | 'batch'
  stock_id: string | null; current_qty: number; min_qty: number
  expiry_date: string | null; batch_number: string | null; cost: number; category?: string
}

type Tab = 'stock' | 'add' | 'history' | 'stocktake' | 'availability' | 'aging' | 'orders' | 'valuation' | 'ledger' | 'waste-analytics'

interface StocktakeSession {
  id: string; session_date: string; notes: string | null
  status: 'open' | 'finalized'; created_at: string; finalized_at: string | null
  approved_by: string | null; approved_at: string | null
}

interface StocktakeItem {
  id: string; ing_sku: string; ing_name: string; unit: string
  item_type: 'ingredient' | 'batch'; theoretical_qty: number; actual_qty: number; unit_cost: number
}

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

interface Props {
  initialItems: InventoryItem[]
  initialMovements: StockMovement[]
  brand: BrandId
}

export default function InventoryClient({ initialItems, initialMovements, brand }: Props) {
  const router = useRouter()
  const { isAccountant, canEdit } = useUserStore()
  const { startLoading, stopLoading } = useGlobalLoading()
  const isAcct = isAccountant()
  const canE = canEdit('inventory')

  const [tab, setTab]           = useState<Tab>('stock')
  const [showAnalyticsMenu, setShowAnalyticsMenu] = useState(false)
  const [items, setItems]       = useState<InventoryItem[]>(initialItems)
  const [movements, setMovements] = useState<StockMovement[]>(initialMovements)

  useEffect(() => {
    setItems(initialItems)
    setMovements(initialMovements)
  }, [initialItems, initialMovements])

  const lowCount     = items.filter(i => stockStatus(i) !== 'ok').length
  const belowPar     = items.filter(i => i.min_qty > 0 && i.current_qty <= i.min_qty)
  const todayStr     = new Date().toLocaleDateString('en-CA')
  const in7Str       = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA')
  const expiringItems = items.filter(i => !!i.expiry_date && i.expiry_date <= in7Str)
    .sort((a, b) => a.expiry_date!.localeCompare(b.expiry_date!))

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">إدارة المخزون</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {items.length} صنف
          {lowCount > 0 && <span className="text-amber-600 mr-2">· {lowCount} تحتاج انتباه</span>}
        </p>
      </div>

      {belowPar.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-red-800">
              تنبيه PAR — {belowPar.length} {belowPar.length === 1 ? 'صنف' : 'أصناف'} تحت الحد الأدنى
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {belowPar.slice(0, 6).map(i => (
                <span key={i.sku} className={`text-xs px-2 py-0.5 rounded-full font-medium ${i.current_qty <= 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                  {i.name}
                  <span className="opacity-60 mr-1">({i.current_qty.toFixed(1)}/{i.min_qty.toFixed(1)} {i.unit})</span>
                </span>
              ))}
              {belowPar.length > 6 && <span className="text-xs text-red-500">+{belowPar.length - 6} أخرى</span>}
            </div>
          </div>
          <button
            onClick={() => setTab('orders')}
            className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium whitespace-nowrap transition-colors flex-shrink-0"
          >
            عرض طلبات الشراء
          </button>
        </div>
      )}

      {expiringItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-800 mb-1.5">تنبيه صلاحية — {expiringItems.length} صنف</p>
          <div className="flex flex-wrap gap-2">
            {expiringItems.map(i => {
              const isExpired = i.expiry_date! < todayStr
              return (
                <span key={i.sku} className={`text-xs px-2 py-0.5 rounded-full font-medium ${isExpired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                  {i.name} — {isExpired ? 'منتهي' : i.expiry_date}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* التبويبات اليومية (4) + dropdown للتحليلات (6) */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit flex-wrap items-center">
        {([['stock', 'المخزون'], ['add', 'إضافة حركة'], ['stocktake', 'الجرد الدوري'], ['availability', 'توافر الأطباق']] as [Tab, string][]).map(([v, l]) => (
          <button key={v} onClick={() => { setTab(v); setShowAnalyticsMenu(false) }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}

        {/* Dropdown التحليلات */}
        <div className="relative">
          <button
            onClick={() => setShowAnalyticsMenu(v => !v)}
            className={`relative px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${(['history','aging','orders','valuation','ledger','waste-analytics'] as Tab[]).includes(tab) ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {(['history','aging','orders','valuation','ledger','waste-analytics'] as Tab[]).includes(tab)
              ? ({ history: 'سجل الحركات', aging: 'عمر المخزون', orders: 'طلبات الشراء', valuation: 'قيمة المخزون', ledger: 'بطاقة الصنف', 'waste-analytics': 'تحليل الهالك' } as Record<Tab, string>)[tab]
              : 'تحليلات'}
            <span className="text-[10px] opacity-60">▾</span>
            {(['orders'] as Tab[]).includes(tab) === false && belowPar.length > 0 && tab !== 'orders' && (
              <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {belowPar.length > 9 ? '9+' : belowPar.length}
              </span>
            )}
          </button>
          {showAnalyticsMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowAnalyticsMenu(false)} />
              <div className="absolute top-full mt-1 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px]">
                {([['history', 'سجل الحركات'], ['aging', 'عمر المخزون'], ['orders', 'طلبات الشراء'], ['valuation', 'قيمة المخزون'], ['ledger', 'بطاقة الصنف'], ['waste-analytics', 'تحليل الهالك']] as [Tab, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => { setTab(v); setShowAnalyticsMenu(false) }}
                    className={`w-full text-right px-4 py-2 text-sm transition-colors ${tab === v ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'} flex items-center justify-between gap-2`}>
                    {l}
                    {v === 'orders' && belowPar.length > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                        {belowPar.length > 9 ? '9+' : belowPar.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {tab === 'stock'        && <StockTab items={items} canE={canE} brand={brand} onRefresh={() => router.refresh()} />}
      {tab === 'add'          && <AddMovementTab items={items} brand={brand} onSaved={() => router.refresh()} />}
      {tab === 'history'      && <HistoryTab movements={movements} />}
      {tab === 'stocktake'    && <StocktakeTab brand={brand} items={items} />}
      {tab === 'availability' && <AvailabilityTab brand={brand} />}
      {tab === 'aging'        && <AgingTab brand={brand} />}
      {tab === 'orders'       && <PurchaseOrdersTab brand={brand} />}
      {tab === 'valuation'      && <ValuationTab items={items} />}
      {tab === 'ledger'         && <LedgerTab items={items} brand={brand} />}
      {tab === 'waste-analytics' && <WasteAnalyticsTab brand={brand} />}
    </div>
  )
}

// ── Tab 1: Stock ──────────────────────────────────────────────────

function StockTab({ items, canE, brand, onRefresh }: {
  items: InventoryItem[]; canE: boolean; brand: BrandId; onRefresh: () => void
}) {
  const [editingSku, setEditingSku] = useState<string | null>(null)
  const [editMin, setEditMin]       = useState('')
  const [editExpiry, setEditExpiry] = useState('')
  const [saving, setSaving]         = useState(false)
  const [search, setSearch]         = useState('')
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
      brand_id: brand, ing_sku: item.sku, ing_name: item.name, unit: item.unit,
      current_qty: item.current_qty, min_qty: Number(editMin) || 0,
      expiry_date: editExpiry || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'brand_id,ing_sku' })
    setSaving(false); setEditingSku(null)
    onRefresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input type="text" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)}
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
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-gray-400 text-sm">لا توجد أصناف</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right bg-gray-50">
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">الصنف</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الكمية الحالية</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الحد الأدنى</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الصلاحية</th>
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
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${item.type === 'batch' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
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
                        <input type="number" value={editMin} onChange={e => setEditMin(e.target.value)}
                          className="w-20 bg-white border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-900 text-center"
                        />
                      ) : <span className="font-mono text-gray-600">{item.min_qty.toFixed(2)}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editing ? (
                        <input type="date" value={editExpiry} onChange={e => setEditExpiry(e.target.value)}
                          className="w-32 bg-white border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-900"
                        />
                      ) : (() => {
                        if (!item.expiry_date) return <span className="text-xs text-gray-300">—</span>
                        const todayLocal = new Date().toLocaleDateString('en-CA')
                        const in7Local   = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA')
                        const expired = item.expiry_date < todayLocal
                        const soon    = item.expiry_date <= in7Local
                        return (
                          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${expired ? 'bg-red-50 text-red-700 font-semibold' : soon ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-gray-600'}`}>
                            {item.expiry_date}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(st)}`}>{statusLabel(st)}</span>
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
                          <button onClick={() => { setEditingSku(item.sku); setEditMin(String(item.min_qty)); setEditExpiry(item.expiry_date ?? '') }}
                            aria-label="تعديل" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">✏</button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Add Movement ───────────────────────────────────────────

function AddMovementTab({ items, brand, onSaved }: { items: InventoryItem[]; brand: BrandId; onSaved: () => void }) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [movType, setMovType]   = useState<MovementType>('in')
  const [qty, setQty]           = useState('')
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null)

  const filtered = search.length >= 1 ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10) : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !qty) return
    setSaving(true); setMsg(null)
    const numQty = Number(qty)
    if (isNaN(numQty) || numQty <= 0) { setMsg({ ok: false, text: 'الكمية يجب أن تكون أكبر من صفر' }); setSaving(false); return }
    const supabase = createClient()
    const user  = (await supabase.auth.getUser()).data.user
    const delta = movType === 'in' || movType === 'adjustment' ? numQty : -numQty
    // Atomic RPC: inserts movement + increments stock in one transaction (prevents lost-update race)
    const { error } = await (supabase as any).rpc('record_stock_movement', {
      p_brand_id:      brand,
      p_ing_sku:       selected.sku,
      p_ing_name:      selected.name,
      p_unit:          selected.unit,
      p_movement_type: movType,
      p_qty:           numQty,
      p_delta:         delta,
      p_value:         Math.round(numQty * (selected.cost ?? 0) * 10000) / 10000,
      p_note:          note || null,
      p_performed_by:  user?.id ?? null,
      p_min_qty:       selected.min_qty ?? 0,
    })
    if (error) { setMsg({ ok: false, text: 'حدث خطأ أثناء تسجيل الحركة. أعد المحاولة.' }); setSaving(false); return }
    setMsg({ ok: true, text: 'تمت الإضافة ✓' })
    setQty(''); setNote(''); setSelected(null); setSearch('')
    setSaving(false); onSaved()
  }

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="text-sm font-semibold text-gray-900">تسجيل حركة مخزون</div>
        <div className="space-y-1">
          <label htmlFor="mov-item" className="text-xs text-gray-500">الصنف</label>
          <div className="relative">
            <input id="mov-item" type="text" placeholder="ابحث بالاسم..." value={selected ? selected.name : search}
              onChange={e => { setSearch(e.target.value); setSelected(null) }}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            {filtered.length > 0 && !selected && (
              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {filtered.map(item => (
                  <button key={item.sku} type="button" onClick={() => { setSelected(item); setSearch('') }}
                    className="w-full text-right px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${item.type === 'batch' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {item.type === 'batch' ? 'باتش' : 'خام'}
                      </span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <span className="text-xs text-gray-400 font-mono flex-shrink-0">{item.current_qty.toFixed(2)} {item.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
              <span className={`font-semibold px-1.5 py-0.5 rounded ${selected.type === 'batch' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                {selected.type === 'batch' ? 'باتش' : 'خام'}
              </span>
              <span>الكمية الحالية: <span className="font-mono font-bold text-gray-800">{selected.current_qty.toFixed(2)} {selected.unit}</span></span>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">نوع الحركة</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            {(['in', 'out', 'waste', 'adjustment'] as MovementType[]).map(t => (
              <button key={t} type="button" onClick={() => setMovType(t)}
                className={`py-3 rounded-lg text-xs font-medium transition-colors ${movType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {movementLabel(t)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="mov-qty" className="text-xs text-gray-500">الكمية{selected && <span className="text-gray-400 mr-1">({selected.unit})</span>}</label>
          <input id="mov-qty" type="number" step="0.001" min="0.001" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.000" required
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="mov-note" className="text-xs text-gray-500">ملاحظة (اختياري)</label>
          <input id="mov-note" type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="سبب الحركة..."
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        {msg && <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
        <button type="submit" disabled={saving || !selected || !qty}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors">
          {saving ? 'جارٍ الحفظ...' : 'تسجيل الحركة'}
        </button>
      </form>
    </div>
  )
}

// ── Tab 3: History ────────────────────────────────────────────────

function movementSource(m: StockMovement): { label: string; cls: string } | null {
  if (m.production_session_id) {
    return { label: `إنتاج #${m.production_session_id.slice(-6).toUpperCase()}`, cls: 'bg-purple-50 text-purple-700' }
  }
  if (m.note?.startsWith('شراء') || m.note?.startsWith('مشتريات') || m.note?.includes('purchase')) {
    return { label: 'مشتريات', cls: 'bg-blue-50 text-blue-700' }
  }
  if (m.note?.startsWith('مبيعات') || m.note?.includes('explode') || m.note?.includes('sales')) {
    return { label: 'مبيعات', cls: 'bg-green-50 text-green-700' }
  }
  if (m.note?.startsWith('جرد') || m.note?.includes('stocktake')) {
    return { label: 'جرد', cls: 'bg-amber-50 text-amber-700' }
  }
  return null
}

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
        <input type="text" placeholder="بحث بالصنف..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-44"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'in', 'out', 'waste', 'adjustment'] as (MovementType | 'all')[]).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${typeFilter === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'all' ? 'الكل' : movementLabel(t as MovementType)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} حركة</span>
      </div>
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-gray-400 text-sm">لا توجد حركات بعد</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right bg-gray-50">
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">التاريخ</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">الصنف</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">النوع</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الكمية</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">المصدر</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const src = movementSource(m)
                return (
                  <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(m.created_at).toLocaleDateString('ar-SA')}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{m.ing_name}</div>
                      <div className="text-xs text-gray-400 font-mono">{m.ing_sku}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold ${movementColor(m.movement_type)}`}>{movementLabel(m.movement_type)}</span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-gray-700">
                      {m.movement_type === 'out' || m.movement_type === 'waste' ? '-' : '+'}{m.qty}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {src
                        ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${src.cls}`}>{src.label}</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{m.note ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 4: Stocktake ──────────────────────────────────────────────

function StocktakeTab({ brand, items }: { brand: BrandId; items: InventoryItem[] }) {
  const { startLoading, stopLoading } = useGlobalLoading()
  const [sessions, setSessions]         = useState<StocktakeSession[]>([])
  const [activeSession, setActiveSession] = useState<StocktakeSession | null>(null)
  const [sessionItems, setSessionItems] = useState<StocktakeItem[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [search, setSearch]   = useState('')
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)

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
    const { data } = await (supabase.from('stocktake_items') as any).select('*').eq('session_id', sessionId).order('ing_name')
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
    if (error) { setSaving(false); setMsg({ ok: false, text: `فشل إنشاء جلسة الجرد: ${error.message}` }); return }
    const [{ data: ings }, { data: batchRecipes }] = await Promise.all([
      (supabase.from('ingredients') as any).select('sku, cost').eq('brand_id', brand),
      (supabase.from('recipes') as any).select('sku, total_cost, yield_portions').eq('brand_id', brand).eq('is_active', true),
    ])
    const costMap = new Map<string, number>()
    for (const i of (ings || []) as any[]) costMap.set(i.sku, i.cost ?? 0)
    for (const r of (batchRecipes || []) as any[]) {
      const yp = Math.max(r.yield_portions ?? 1, 1)
      costMap.set(r.sku, (r.total_cost ?? 0) / yp)
    }
    const rows = items.map(i => ({
      session_id: session.id, ing_sku: i.sku, ing_name: i.name, unit: i.unit,
      item_type: i.type, theoretical_qty: i.current_qty, actual_qty: i.current_qty,
      unit_cost: costMap.get(i.sku) ?? 0,
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
    setSaving(false); setMsg({ ok: true, text: 'تم الحفظ ✓' })
    setTimeout(() => setMsg(null), 3000)
  }

  async function doFinalize() {
    if (!activeSession) return
    setSaving(true)
    startLoading('جارٍ إنهاء جلسة الجرد...')
    const minQtyMap = new Map(items.map(i => [i.sku, i.min_qty]))
    const costMap   = new Map(items.map(i => [i.sku, i.cost ?? 0]))
    try {
      const res = await fetch(`/api/stocktake/${activeSession.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: brand,
          session_items: sessionItems.map(item => ({
            id:         item.id,
            ing_sku:    item.ing_sku,
            ing_name:   item.ing_name,
            unit:       item.unit,
            actual_qty: item.actual_qty,
            unit_cost:  costMap.get(item.ing_sku) ?? item.unit_cost,
            min_qty:    minQtyMap.get(item.ing_sku) ?? 0,
          })),
        }),
      })
      setSaving(false)
      if (res.ok) {
        setActiveSession(null); setSessionItems([])
        await loadSessions()
        setMsg({ ok: true, text: 'تم إنهاء الجرد وتحديث المخزون ✓' })
        setTimeout(() => setMsg(null), 4000)
      } else {
        const d = await res.json().catch(() => ({}))
        const status = res.status
        setMsg({ ok: false, text: status === 423 ? (d.error ?? 'الفترة مُغلقة') : (d.error ?? 'فشل إنهاء الجرد') })
      }
    } finally {
      stopLoading()
    }
  }

  function handleFinalize() {
    if (!activeSession) return
    setDlg({ msg: 'إنهاء الجرد وتحديث المخزون بالكميات الفعلية؟', onOk: doFinalize })
  }

  function handleApproveSession(sessionId: string) {
    setDlg({ msg: 'اعتماد هذا الجرد؟ لن يمكن التراجع.', onOk: async () => {
      startLoading('جارٍ اعتماد جلسة الجرد...')
      try {
        const res = await fetch(`/api/stocktake/${sessionId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_id: brand }),
        })
        if (res.ok) {
          await loadSessions()
          setMsg({ ok: true, text: 'تم اعتماد الجرد ✓' })
          setTimeout(() => setMsg(null), 3000)
        } else {
          const d = await res.json()
          setMsg({ ok: false, text: d.error ?? 'فشل الاعتماد' })
        }
      } finally {
        stopLoading()
      }
    }})
  }

  if (activeSession) {
    const filtered     = search ? sessionItems.filter(i => i.ing_name.toLowerCase().includes(search.toLowerCase())) : sessionItems
    const totalVariance = sessionItems.reduce((s, i) => s + (i.actual_qty - i.theoretical_qty) * i.unit_cost, 0)
    const variantCount  = sessionItems.filter(i => Math.abs(i.actual_qty - i.theoretical_qty) > 0.001).length
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
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">رجوع</button>
          </div>
        </div>
        {msg && <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
        <input type="text" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-blue-500"
        />
        {loadingItems ? <div className="text-center py-12 text-gray-400 text-sm">جارٍ التحميل...</div> : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table suppressHydrationWarning className="w-full text-sm">
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
                  const vValue   = variance * item.unit_cost
                  const hasV     = Math.abs(variance) > 0.001
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
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setSessionItems(prev => prev.map(i => i.id === item.id ? { ...i, actual_qty: v } : i)) }}
                          className="w-32 text-center bg-white border border-gray-300 rounded px-2 py-2 text-xs font-mono focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
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
        <button onClick={() => setShowNewForm(v => !v)} className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg">+ بدء جرد جديد</button>
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
              <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="مثال: جرد نهاية الشهر"
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
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">إلغاء</button>
          </div>
        </div>
      )}
      {loadingSessions ? <div className="text-center py-12 text-gray-400 text-sm">جارٍ التحميل...</div>
        : sessions.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-gray-400 text-sm">لا توجد جردات سابقة — ابدأ جرداً جديداً</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table suppressHydrationWarning className="w-full text-sm">
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
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'finalized' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                          {s.status === 'finalized' ? 'منتهي' : 'مفتوح'}
                        </span>
                        {s.approved_at && (
                          <span className="text-[10px] text-purple-600 font-medium">معتمد ✓</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={async () => { setActiveSession(s); await loadSessionItems(s.id) }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          {s.status === 'finalized' ? 'عرض' : 'متابعة'}
                        </button>
                        {s.status === 'finalized' && !s.approved_at && (
                          <button onClick={() => handleApproveSession(s.id)}
                            className="text-xs px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-medium transition-colors">
                            اعتماد
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}

// ── Tab 5: Availability ────────────────────────────────────────────

interface DishAvail { sku: string; name: string; maxPortions: number; limitingIngredient: string | null; status: 'ok' | 'low' | 'blocked' }

function AvailabilityTab({ brand }: { brand: BrandId }) {
  const [dishes, setDishes] = useState<DishAvail[]>([])
  const [loading, setLoading] = useState(true)
  const LOW = 10

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const [{ data: recipes }, { data: stockRows }] = await Promise.all([
        (supabase.from('recipes') as any).select('id, sku, product_name, yield_portions').eq('brand_id', brand).eq('is_active', true).eq('is_approved', true).eq('is_semi', false),
        (supabase.from('stock_items') as any).select('ing_sku, current_qty').eq('brand_id', brand),
      ])
      const recipeIds = ((recipes || []) as any[]).map((r: any) => r.id)
      const { data: ings } = recipeIds.length > 0
        ? await (supabase.from('recipe_ingredients') as any).select('recipe_id, ing_sku, ing_name, qty, yield_pct').in('recipe_id', recipeIds)
        : { data: [] }
      if (cancelled) return
      const stockMap = new Map<string, number>()
      for (const s of (stockRows || []) as any[]) stockMap.set(s.ing_sku, s.current_qty)
      const result: DishAvail[] = []
      for (const r of (recipes || []) as any[]) {
        const recipeIngs = (ings || []).filter((i: any) => i.recipe_id === r.id)
        if (!recipeIngs.length) continue
        const yp = Math.max(r.yield_portions, 1)
        let maxPortions = Infinity; let limitIng: string | null = null
        for (const ing of recipeIngs as any[]) {
          if ((ing.yield_pct ?? 0) <= 0) continue
          const gpp = (ing.qty / (ing.yield_pct / 100)) / yp
          if (gpp <= 0) continue
          const possible = Math.floor((stockMap.get(ing.ing_sku) ?? 0) / gpp)
          if (possible < maxPortions) { maxPortions = possible; limitIng = ing.ing_name }
        }
        if (maxPortions === Infinity) maxPortions = 0
        result.push({ sku: r.sku, name: r.product_name, maxPortions, limitingIngredient: maxPortions < LOW ? limitIng : null, status: maxPortions === 0 ? 'blocked' : maxPortions < LOW ? 'low' : 'ok' })
      }
      result.sort((a, b) => { const o = { blocked: 0, low: 1, ok: 2 }; return o[a.status] !== o[b.status] ? o[a.status] - o[b.status] : a.maxPortions - b.maxPortions })
      setDishes(result); setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [brand])

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">جارٍ التحليل...</div>
  const blocked = dishes.filter(d => d.status === 'blocked')
  const low     = dishes.filter(d => d.status === 'low')
  const ok      = dishes.filter(d => d.status === 'ok')
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`rounded-xl border p-4 text-center ${blocked.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className={`text-3xl font-bold font-mono ${blocked.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>{blocked.length}</div>
          <div className={`text-xs font-semibold mt-1 ${blocked.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>🔴 معطّل</div>
          <div className="text-xs text-gray-400 mt-0.5">لا يمكن تحضيره الآن</div>
        </div>
        <div className={`rounded-xl border p-4 text-center ${low.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className={`text-3xl font-bold font-mono ${low.length > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{low.length}</div>
          <div className={`text-xs font-semibold mt-1 ${low.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>🟡 منخفض (أقل من {LOW})</div>
          <div className="text-xs text-gray-400 mt-0.5">يحتاج انتباهاً قريباً</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold font-mono text-green-600">{ok.length}</div>
          <div className="text-xs font-semibold mt-1 text-green-600">✅ متاح</div>
          <div className="text-xs text-gray-400 mt-0.5">كمية كافية</div>
        </div>
      </div>
      {dishes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">لا توجد وصفات نشطة</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-right px-4 py-3 font-medium">الطبق</th>
                <th className="text-center px-4 py-3 font-medium">أقصى حصص ممكنة</th>
                <th className="text-right px-4 py-3 font-medium">المكوّن المحدِّد</th>
                <th className="text-center px-4 py-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {dishes.map((d, i) => (
                <tr key={d.sku} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{d.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{d.sku}</div>
                  </td>
                  <td className={`px-4 py-2.5 text-center font-mono font-bold text-lg ${d.status === 'blocked' ? 'text-red-600' : d.status === 'low' ? 'text-amber-600' : 'text-green-600'}`}>{d.maxPortions}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{d.limitingIngredient ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {d.status === 'blocked' && <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full font-semibold">🔴 معطّل</span>}
                    {d.status === 'low'     && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-semibold">🟡 منخفض</span>}
                    {d.status === 'ok'      && <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-semibold">✅ متاح</span>}
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

// ── Tab 6: Aging ──────────────────────────────────────────────────

function AgingTab({ brand }: { brand: BrandId }) {
  const [items, setItems]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays]       = useState(14)
  const [sortBy, setSortBy]   = useState<'days' | 'value'>('days')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const [{ data: stocks }, { data: moves }, { data: ings }, { data: batchRecipes }] = await Promise.all([
        (supabase.from('stock_items') as any).select('ing_sku, ing_name, current_qty, min_qty, updated_at').eq('brand_id', brand).gt('current_qty', 0),
        (supabase.from('stock_movements') as any).select('ing_sku, created_at').eq('brand_id', brand).in('movement_type', ['out', 'waste']).order('created_at', { ascending: false }).limit(2000),
        (supabase.from('ingredients') as any).select('sku, cost').eq('brand_id', brand),
        (supabase.from('recipes') as any).select('sku, total_cost, yield_portions').eq('brand_id', brand).eq('is_active', true),
      ])
      if (cancelled) return
      const lastMoveMap = new Map<string, string>()
      for (const m of (moves || []) as any[]) { if (!lastMoveMap.has(m.ing_sku)) lastMoveMap.set(m.ing_sku, m.created_at) }
      const costMap = new Map<string, number>()
      for (const i of (ings || []) as any[]) costMap.set(i.sku, i.cost ?? 0)
      for (const r of (batchRecipes || []) as any[]) {
        const yp = Math.max(r.yield_portions ?? 1, 1)
        costMap.set(r.sku, (r.total_cost ?? 0) / yp)
      }
      const todayMs = Date.now()
      const result = ((stocks || []) as any[]).map((s: any) => {
        const lastMove  = lastMoveMap.get(s.ing_sku)
        const lastMs    = lastMove ? new Date(lastMove).getTime() : new Date(s.updated_at).getTime()
        const daysSince = Math.floor((todayMs - lastMs) / 86400000)
        const unitCost  = costMap.get(s.ing_sku) ?? 0
        return { ...s, daysSince, lastMove: lastMove ?? null, unitCost, value: s.current_qty * unitCost }
      }).filter((s: any) => s.daysSince >= days).sort((a: any, b: any) => sortBy === 'days' ? b.daysSince - a.daysSince : b.value - a.value)
      setItems(result); setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [brand, days, sortBy])

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">جارٍ التحليل...</div>
  const totalValue = items.reduce((s: number, r: any) => s + r.value, 0)
  const oldItems   = items.filter((r: any) => r.daysSince >= 30)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">عمر المخزون — أصناف بطيئة الحركة</h2>
          <p className="text-xs text-gray-500 mt-0.5">{items.length} صنف لم يُصرف منذ {days}+ يوم · قيمة: {totalValue.toFixed(0)} ر.س</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${days === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {d}+ يوم
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 bg-white">
            <option value="days">ترتيب بالأيام</option>
            <option value="value">ترتيب بالقيمة</option>
          </select>
        </div>
      </div>
      {oldItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">{oldItems.length} صنف</span> لم يُصرف منذ أكثر من 30 يوماً — قيمة إجمالية: <span className="font-mono font-bold">{oldItems.reduce((s: number, r: any) => s + r.value, 0).toFixed(0)} ر.س</span>
        </div>
      )}
      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">لا توجد أصناف بطيئة الحركة — المخزون متحرك جيداً ✓</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-right px-4 py-3 font-medium">الصنف</th>
                <th className="text-center px-4 py-3 font-medium">أيام بدون صرف</th>
                <th className="text-center px-4 py-3 font-medium">الكمية الحالية</th>
                <th className="text-left px-4 py-3 font-medium">قيمة المخزون</th>
                <th className="text-center px-4 py-3 font-medium">آخر صرف</th>
                <th className="text-center px-4 py-3 font-medium">التحذير</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r: any, i: number) => (
                <tr key={r.ing_sku} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900 text-sm">{r.ing_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{r.ing_sku}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-mono font-bold text-lg ${r.daysSince >= 30 ? 'text-red-600' : r.daysSince >= 14 ? 'text-amber-600' : 'text-gray-600'}`}>{r.daysSince}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-700 text-xs">{r.current_qty.toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-xs">
                    {r.value > 0 ? <span className={r.value > 500 ? 'text-red-600' : r.value > 100 ? 'text-amber-600' : 'text-gray-600'}>{r.value.toFixed(2)} ر.س</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-400 font-mono">{r.lastMove ? r.lastMove.slice(0, 10) : 'لا يوجد'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {r.daysSince >= 30
                      ? <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">راكد</span>
                      : <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">بطيء</span>}
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

// ── Tab 9: Item Ledger (بطاقة الصنف) ─────────────────────────────

function signedEffect(type: MovementType, qty: number): number {
  if (type === 'in')         return qty
  if (type === 'out')        return -Math.abs(qty)
  if (type === 'waste')      return -Math.abs(qty)
  /* adjustment */           return qty  // stored signed
}

interface LedgerRow {
  id: string; created_at: string; movement_type: MovementType
  qty: number; value: number | null; note: string | null
  running_balance: number
}

function LedgerTab({ items, brand }: { items: InventoryItem[]; brand: BrandId }) {
  const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA')
  const defaultTo   = new Date().toLocaleDateString('en-CA')

  const [selectedSku, setSelectedSku] = useState<string>('')
  const [search, setSearch]           = useState('')
  const [showList, setShowList]       = useState(false)
  const [fromDate, setFromDate]       = useState(defaultFrom)
  const [toDate, setToDate]           = useState(defaultTo)
  const [loading, setLoading]         = useState(false)
  const [rows, setRows]               = useState<LedgerRow[]>([])
  const [openingBalance, setOpeningBalance] = useState<number | null>(null)
  const [closingBalance, setClosingBalance] = useState<number | null>(null)
  const cancelRef = useRef(false)

  const selectedItem = items.find(i => i.sku === selectedSku) ?? null
  const filteredItems = search.length >= 1
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
    : []

  const load = useCallback(async () => {
    if (!selectedSku) return
    cancelRef.current = false
    setLoading(true)
    const supabase = createClient()

    // Fetch movements in range (for display)
    const { data: rangeMovs } = await (supabase.from('stock_movements') as any)
      .select('id, created_at, movement_type, qty, value, note')
      .eq('brand_id', brand)
      .eq('ing_sku', selectedSku)
      .gte('created_at', fromDate)
      .lte('created_at', toDate + 'T23:59:59')
      .order('created_at', { ascending: true })

    // Fetch movements AFTER toDate (to compute opening/closing from current stock)
    const { data: futureMovs } = await (supabase.from('stock_movements') as any)
      .select('movement_type, qty')
      .eq('brand_id', brand)
      .eq('ing_sku', selectedSku)
      .gt('created_at', toDate + 'T23:59:59')

    // current_qty from stock_items
    const { data: stockRow } = await (supabase.from('stock_items') as any)
      .select('current_qty')
      .eq('brand_id', brand)
      .eq('ing_sku', selectedSku)
      .maybeSingle()

    const currentQty: number = (stockRow as any)?.current_qty ?? 0

    // closing = currentQty minus all effects that happened AFTER toDate
    const futureNet = ((futureMovs ?? []) as any[]).reduce((s: number, m: any) => s + signedEffect(m.movement_type, m.qty), 0)
    const closing = currentQty - futureNet

    // Build ledger rows with running balance
    const rangeList = (rangeMovs ?? []) as any[]
    let balance = closing
    // Walk forward from opening: start = closing - sum(range effects)
    const rangeNet = rangeList.reduce((s: number, m: any) => s + signedEffect(m.movement_type, m.qty), 0)
    const opening = closing - rangeNet

    balance = opening
    const ledgerRows: LedgerRow[] = rangeList.map(m => {
      const effect = signedEffect(m.movement_type, m.qty)
      balance += effect
      return {
        id: m.id, created_at: m.created_at, movement_type: m.movement_type,
        qty: m.qty, value: m.value ?? null, note: m.note ?? null,
        running_balance: Math.round(balance * 1000) / 1000,
      }
    })

    if (cancelRef.current) return
    setOpeningBalance(Math.round(opening * 1000) / 1000)
    setClosingBalance(Math.round(closing * 1000) / 1000)
    setRows(ledgerRows)
    setLoading(false)
  }, [brand, selectedSku, fromDate, toDate])

  useEffect(() => {
    if (selectedSku) load()
    return () => { cancelRef.current = true }
  }, [load, selectedSku])

  // Summary stats
  const totalIn    = rows.filter(r => r.movement_type === 'in').reduce((s, r) => s + r.qty, 0)
  const totalOut   = rows.filter(r => r.movement_type === 'out').reduce((s, r) => s + r.qty, 0)
  const totalWaste = rows.filter(r => r.movement_type === 'waste').reduce((s, r) => s + r.qty, 0)
  const totalAdj   = rows.filter(r => r.movement_type === 'adjustment').reduce((s, r) => s + r.qty, 0)
  const totalValueOut = rows.filter(r => r.movement_type === 'out' || r.movement_type === 'waste').reduce((s, r) => s + (r.value ?? 0), 0)

  async function exportExcel() {
    if (!selectedItem || openingBalance === null) return
    let _xlsx: typeof import('xlsx') | null = null
    if (!_xlsx) _xlsx = await import('xlsx')
    const X = _xlsx
    const wb = X.utils.book_new()
    const header = [['بطاقة الصنف:', selectedItem.name, '', 'الوحدة:', selectedItem.unit]]
    header.push(['الفترة:', `${fromDate} → ${toDate}`, '', '', ''])
    header.push([])
    header.push(['رصيد أول المدة', '', '', '', String(openingBalance)])
    const dataRows = rows.map(r => [
      new Date(r.created_at).toLocaleDateString('ar-SA'),
      movementLabel(r.movement_type),
      r.movement_type === 'out' || r.movement_type === 'waste' ? -Math.abs(r.qty) : r.qty,
      r.value ?? '',
      r.running_balance,
      r.note ?? '',
    ])
    const allRows = [
      ...header,
      ['التاريخ', 'النوع', 'الكمية', 'القيمة (ر.س)', 'الرصيد', 'ملاحظة'],
      ...dataRows,
      [],
      ['رصيد آخر المدة', '', '', '', closingBalance],
    ]
    const ws = X.utils.aoa_to_sheet(allRows)
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 30 }]
    X.utils.book_append_sheet(wb, ws, 'بطاقة الصنف')
    X.writeFile(wb, `بطاقة_${selectedItem.name}_${fromDate}.xlsx`)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">بطاقة الصنف</h2>
        <p className="text-xs text-gray-500 mt-0.5">رصيد أول المدة + الحركات + رصيد آخر المدة</p>
      </div>

      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap">
        {/* Ingredient picker */}
        <div className="space-y-1 relative">
          <label className="text-xs text-gray-500">الصنف</label>
          <input
            type="text"
            placeholder="ابحث..."
            value={selectedItem ? selectedItem.name : search}
            onChange={e => { setSearch(e.target.value); setSelectedSku(''); setShowList(true) }}
            onFocus={() => setShowList(true)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 w-52"
          />
          {showList && filteredItems.length > 0 && !selectedSku && (
            <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {filteredItems.map(item => (
                <button key={item.sku} type="button"
                  onClick={() => { setSelectedSku(item.sku); setSearch(''); setShowList(false) }}
                  className="w-full text-right px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                  <span>{item.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{item.current_qty.toFixed(2)} {item.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">من</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">إلى</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        {selectedSku && (
          <button onClick={exportExcel}
            className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors self-end">
            ⬇ Excel
          </button>
        )}
      </div>

      {!selectedSku && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          اختر صنفاً لعرض بطاقته المحاسبية
        </div>
      )}

      {selectedSku && loading && (
        <div className="py-16 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
      )}

      {selectedSku && !loading && openingBalance !== null && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
              <p className="text-xs text-green-500">إجمالي وارد</p>
              <p className="font-mono font-bold text-green-700">{totalIn.toFixed(3)} <span className="text-xs font-normal">{selectedItem?.unit}</span></p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <p className="text-xs text-red-400">إجمالي صادر (وصفات)</p>
              <p className="font-mono font-bold text-red-600">{totalOut.toFixed(3)} <span className="text-xs font-normal">{selectedItem?.unit}</span></p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <p className="text-xs text-amber-500">هالك</p>
              <p className="font-mono font-bold text-amber-600">{totalWaste.toFixed(3)} <span className="text-xs font-normal">{selectedItem?.unit}</span></p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
              <p className="text-xs text-gray-500">قيمة المنصرف + هالك</p>
              <p className="font-mono font-bold text-gray-700">{totalValueOut.toFixed(2)} <span className="text-xs font-normal">ر.س</span></p>
            </div>
          </div>
          {totalAdj !== 0 && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 text-xs">
              <span className="text-purple-600 font-medium">تسويات خلال الفترة: </span>
              <span className="font-mono text-purple-700">{totalAdj >= 0 ? '+' : ''}{totalAdj.toFixed(3)} {selectedItem?.unit}</span>
            </div>
          )}

          {/* Ledger table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                  <th className="text-center px-4 py-3 font-medium">النوع</th>
                  <th className="text-center px-4 py-3 font-medium">الكمية</th>
                  <th className="text-center px-4 py-3 font-medium">القيمة (ر.س)</th>
                  <th className="text-center px-4 py-3 font-medium">الرصيد</th>
                  <th className="text-right px-4 py-3 font-medium">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row */}
                <tr className="bg-blue-50 border-b border-blue-100">
                  <td className="px-4 py-2.5 text-xs text-blue-600 font-medium">{fromDate}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">رصيد أول المدة</span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-400 text-xs">—</td>
                  <td className="px-4 py-2.5 text-center text-gray-400 text-xs">—</td>
                  <td className="px-4 py-2.5 text-center font-mono font-bold text-blue-700">{openingBalance.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">—</td>
                </tr>

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">لا توجد حركات في هذه الفترة</td>
                  </tr>
                )}

                {rows.map((r, i) => {
                  const effect = signedEffect(r.movement_type, r.qty)
                  const isPositive = effect > 0
                  return (
                    <tr key={r.id} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString('ar-SA')}
                        <span className="text-gray-300 mr-1 font-mono">{new Date(r.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-semibold ${movementColor(r.movement_type)}`}>{movementLabel(r.movement_type)}</span>
                      </td>
                      <td className={`px-4 py-2.5 text-center font-mono font-semibold text-sm ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                        {isPositive ? '+' : ''}{effect.toFixed(3)}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-600">
                        {r.value != null ? r.value.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono font-bold text-gray-800 text-sm">
                        {r.running_balance.toFixed(3)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[180px] truncate">{r.note ?? '—'}</td>
                    </tr>
                  )
                })}

                {/* Closing balance row */}
                <tr className="bg-gray-800 text-white">
                  <td className="px-4 py-2.5 text-xs font-medium">{toDate}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-xs bg-gray-600 text-white px-2 py-0.5 rounded-full font-semibold">رصيد آخر المدة</span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-400 text-xs">—</td>
                  <td className="px-4 py-2.5 text-center text-gray-400 text-xs">—</td>
                  <td className="px-4 py-2.5 text-center font-mono font-bold text-lg">{closingBalance!.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab 8: Stock Valuation ────────────────────────────────────────

function ValuationTab({ items }: { items: InventoryItem[] }) {
  const ingItems = items.filter(i => i.type === 'ingredient' && i.cost > 0)

  // Group by category
  const catMap = new Map<string, InventoryItem[]>()
  for (const item of ingItems) {
    const cat = item.category ?? 'غير مصنّف'
    if (!catMap.has(cat)) catMap.set(cat, [])
    catMap.get(cat)!.push(item)
  }
  const categories = [...catMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))
  const grandTotal = ingItems.reduce((s, i) => s + i.current_qty * i.cost, 0)
  const zeroStock  = ingItems.filter(i => i.current_qty <= 0).length

  async function exportExcel() {
    let _xlsx: typeof import('xlsx') | null = null
    if (!_xlsx) _xlsx = await import('xlsx')
    const X = _xlsx
    const wb = X.utils.book_new()
    const rows: any[] = [['الفئة', 'الصنف', 'الوحدة', 'الكمية', 'تكلفة/وحدة (ر.س)', 'القيمة الإجمالية (ر.س)']]
    for (const [cat, catItems] of categories) {
      for (const item of catItems) {
        rows.push([cat, item.name, item.unit, item.current_qty, item.cost, item.current_qty * item.cost])
      }
      const catTotal = catItems.reduce((s, i) => s + i.current_qty * i.cost, 0)
      rows.push(['', `إجمالي ${cat}`, '', '', '', catTotal])
      rows.push([])
    }
    rows.push(['', 'الإجمالي الكلي', '', '', '', grandTotal])
    const ws = X.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 22 }]
    X.utils.book_append_sheet(wb, ws, 'قيمة المخزون')
    X.writeFile(wb, `قيمة_المخزون_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">قيمة المخزون الحالية</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {ingItems.length} صنف مواد خام
            {zeroStock > 0 && <span className="text-gray-400"> · {zeroStock} كمية صفر</span>}
          </p>
        </div>
        <button onClick={exportExcel}
          className="flex items-center gap-2 text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
          ⬇ تصدير Excel
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-500">إجمالي قيمة المخزون</p>
          <p className="text-xl font-bold font-mono text-blue-700 mt-0.5">{grandTotal.toFixed(2)} <span className="text-sm font-normal">ر.س</span></p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">عدد الأصناف</p>
          <p className="text-xl font-bold text-gray-700 mt-0.5">{ingItems.length}</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">عدد الفئات</p>
          <p className="text-xl font-bold text-gray-700 mt-0.5">{categories.length}</p>
        </div>
      </div>

      {/* Per-category tables */}
      {categories.map(([cat, catItems]) => {
        const catTotal = catItems.reduce((s, i) => s + i.current_qty * i.cost, 0)
        const sorted   = [...catItems].sort((a, b) => (b.current_qty * b.cost) - (a.current_qty * a.cost))
        return (
          <div key={cat} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <span className="font-semibold text-gray-800 text-sm">{cat}</span>
              <span className="font-mono font-bold text-blue-700 text-sm">{catTotal.toFixed(2)} ر.س</span>
            </div>
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-right px-4 py-2 font-medium">الصنف</th>
                  <th className="text-center px-4 py-2 font-medium">الكمية</th>
                  <th className="text-center px-4 py-2 font-medium">تكلفة/وحدة</th>
                  <th className="text-left px-4 py-2 font-medium">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, i) => {
                  const value = item.current_qty * item.cost
                  return (
                    <tr key={item.sku} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-gray-900">{item.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono mr-2">{item.sku}</span>
                        {item.current_qty <= 0 && <span className="text-[10px] bg-red-50 text-red-500 px-1 rounded mr-1">نفد</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-700 text-xs">{item.current_qty.toFixed(3)} {item.unit}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-500 text-xs">{item.cost.toFixed(4)}</td>
                      <td className={`px-4 py-2.5 font-mono font-semibold text-xs ${value > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                        {value > 0 ? `${value.toFixed(2)} ر.س` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      {/* Grand total row */}
      <div className="bg-blue-600 text-white rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">إجمالي قيمة المخزون</span>
        <span className="font-mono font-bold text-lg">{grandTotal.toFixed(2)} ر.س</span>
      </div>
    </div>
  )
}

// ── Tab 7: Purchase Orders ────────────────────────────────────────

function PurchaseOrdersTab({ brand }: { brand: BrandId }) {
  const [orders, setOrders]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [multiplier, setMultiplier] = useState(2)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const [{ data: stocks }, { data: lastPurchases }, { data: suppliers }] = await Promise.all([
        (supabase.from('stock_items') as any).select('ing_sku, ing_name, current_qty, min_qty, unit').eq('brand_id', brand).filter('min_qty', 'gt', 0),
        (supabase.from('purchases') as any).select('ing_sku, ing_name, supplier_name, unit_cost, purchase_date, unit').eq('brand_id', brand).order('purchase_date', { ascending: false }).limit(500),
        (supabase.from('suppliers') as any).select('id, name, phone, contact_person').eq('brand_id', brand),
      ])
      const lastPriceMap = new Map<string, { supplier: string; unit_cost: number; date: string }>()
      const cheapestMap  = new Map<string, { supplier: string; unit_cost: number }>()
      for (const p of (lastPurchases || []) as any[]) {
        if (!lastPriceMap.has(p.ing_sku)) lastPriceMap.set(p.ing_sku, { supplier: p.supplier_name, unit_cost: p.unit_cost, date: p.purchase_date })
        const ex = cheapestMap.get(p.ing_sku)
        if (!ex || p.unit_cost < ex.unit_cost) cheapestMap.set(p.ing_sku, { supplier: p.supplier_name, unit_cost: p.unit_cost })
      }
      const supplierNames = new Set((suppliers || []).map((s: any) => s.name))
      const result = ((stocks || []) as any[]).filter((s: any) => s.current_qty <= s.min_qty).map((s: any) => {
        const target = s.min_qty * multiplier; const needed = Math.max(0, target - s.current_qty)
        const last   = lastPriceMap.get(s.ing_sku); const cheap = cheapestMap.get(s.ing_sku)
        const unitCost = cheap?.unit_cost ?? last?.unit_cost ?? 0
        return { sku: s.ing_sku, name: s.ing_name, unit: s.unit ?? '—', current: s.current_qty, min: s.min_qty, target, needed, suggestedSupplier: cheap?.supplier ?? '—', lastSupplier: last?.supplier ?? '—', unitCost, estimatedCost: needed * unitCost, isRegisteredSupplier: supplierNames.has(cheap?.supplier ?? '') }
      }).sort((a: any, b: any) => b.estimatedCost - a.estimatedCost)
      setOrders(result); setLoading(false)
    }
    load()
  }, [brand, multiplier])

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">جارٍ التحليل...</div>
  const totalEstimate = orders.reduce((s: number, r: any) => s + r.estimatedCost, 0)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">اقتراحات طلبات الشراء</h2>
          <p className="text-xs text-gray-500 mt-0.5">{orders.length} صنف تحت الحد الأدنى · تقدير إجمالي: <span className="font-mono font-semibold text-blue-700">{totalEstimate.toFixed(0)} ر.س</span></p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">الهدف:</span>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[1.5, 2, 3].map(m => (
              <button key={m} onClick={() => setMultiplier(m)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${multiplier === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m}× الحد
              </button>
            ))}
          </div>
        </div>
      </div>
      {orders.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-10 text-center">
          <p className="text-green-700 font-semibold text-sm">جميع الأصناف فوق الحد الأدنى ✓</p>
          <p className="text-green-600 text-xs mt-1">لا توجد طلبات شراء مقترحة الآن</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-right px-4 py-3 font-medium">الصنف</th>
                <th className="text-center px-4 py-3 font-medium">المخزون الحالي</th>
                <th className="text-center px-4 py-3 font-medium">الحد الأدنى</th>
                <th className="text-center px-4 py-3 font-medium">الكمية المقترحة</th>
                <th className="text-right px-4 py-3 font-medium">المورد المقترح</th>
                <th className="text-center px-4 py-3 font-medium">سعر الوحدة</th>
                <th className="text-left px-4 py-3 font-medium">تقدير الطلب</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((r: any, i: number) => (
                <tr key={r.sku} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900 text-xs">{r.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{r.sku} · {r.unit}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center"><span className={`font-mono font-bold text-xs ${r.current <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{r.current.toFixed(2)}</span></td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-500 text-xs">{r.min.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-center"><span className="font-mono font-bold text-blue-700 text-sm">{r.needed.toFixed(2)}</span><span className="text-[10px] text-gray-400 mr-1">{r.unit}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {r.isRegisteredSupplier && <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded">مسجّل</span>}
                      <span className="text-xs text-gray-700 font-medium">{r.suggestedSupplier}</span>
                    </div>
                    {r.suggestedSupplier !== r.lastSupplier && r.lastSupplier !== '—' && <div className="text-[10px] text-gray-400 mt-0.5">آخر طلب: {r.lastSupplier}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-600 text-xs">{r.unitCost > 0 ? `${r.unitCost.toFixed(3)} ر.س` : '—'}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-xs">
                    {r.estimatedCost > 0 ? <span className={r.estimatedCost > 1000 ? 'text-red-600' : r.estimatedCost > 200 ? 'text-amber-600' : 'text-gray-700'}>{r.estimatedCost.toFixed(2)} ر.س</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-700 text-right">الإجمالي التقديري</td>
                <td className="px-4 py-3 font-mono font-bold text-blue-700">{totalEstimate.toFixed(2)} ر.س</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 10: Waste Analytics ────────────────────────────────────────

interface WasteRow {
  ing_sku: string; ing_name: string; unit: string
  total_qty: number; total_value: number; count: number
}

function WasteAnalyticsTab({ brand }: { brand: BrandId }) {
  const [rows, setRows]       = useState<WasteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [months, setMonths]   = useState(3)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const since = new Date()
    since.setMonth(since.getMonth() - months)
    const { data } = await (supabase.from('stock_movements') as any)
      .select('ing_sku, ing_name, unit, qty, value')
      .eq('brand_id', brand)
      .eq('movement_type', 'waste')
      .gte('created_at', since.toISOString())
    const map = new Map<string, WasteRow>()
    for (const r of (data || []) as any[]) {
      const ex = map.get(r.ing_sku)
      if (ex) {
        ex.total_qty   += r.qty
        ex.total_value += r.value ?? 0
        ex.count       += 1
      } else {
        map.set(r.ing_sku, { ing_sku: r.ing_sku, ing_name: r.ing_name, unit: r.unit ?? '', total_qty: r.qty, total_value: r.value ?? 0, count: 1 })
      }
    }
    setRows([...map.values()].sort((a, b) => b.total_value - a.total_value))
    setLoading(false)
  }, [brand, months])

  useEffect(() => { load() }, [load])

  const totalQty   = rows.reduce((s, r) => s + r.total_qty, 0)
  const totalValue = rows.reduce((s, r) => s + r.total_value, 0)

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">جارٍ التحميل...</div>

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[1, 3, 6, 12].map(n => (
            <button key={n} onClick={() => setMonths(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${months === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {n === 1 ? 'شهر' : `${n} أشهر`}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs text-red-500 font-medium">إجمالي قيمة الهالك</p>
          <p className="text-xl font-bold text-red-700 font-mono mt-1">{totalValue.toFixed(2)} <span className="text-sm font-normal">ر.س</span></p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">عدد الأصناف المتضررة</p>
          <p className="text-xl font-bold text-gray-700 font-mono mt-1">{rows.length}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">عدد حركات الهالك</p>
          <p className="text-xl font-bold text-gray-700 font-mono mt-1">{rows.reduce((s, r) => s + r.count, 0)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          لا توجد حركات هالك في هذه الفترة
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">أعلى الأصناف هالكاً بالقيمة (ر.س)</p>
            <div className="space-y-2">
              {rows.slice(0, 10).map(r => (
                <div key={r.ing_sku} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-32 truncate text-right">{r.ing_name}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-400 rounded-full transition-all"
                      style={{ width: `${rows[0].total_value > 0 ? (r.total_value / rows[0].total_value) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-semibold text-red-700 w-20 text-end">{r.total_value.toFixed(2)} ر.س</span>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium">الصنف</th>
                  <th className="text-center px-4 py-3 font-medium">عدد الحركات</th>
                  <th className="text-center px-4 py-3 font-medium">الكمية الكلية</th>
                  <th className="text-center px-4 py-3 font-medium">القيمة الكلية</th>
                  <th className="text-center px-4 py-3 font-medium">% من الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.ing_sku} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-900">{r.ing_name}</span>
                      <span className="text-[10px] text-gray-400 mr-1">/ {r.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-500 font-mono">{r.count}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-700">{r.total_qty.toFixed(3)} {r.unit}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-xs font-semibold text-red-700">{r.total_value.toFixed(2)} ر.س</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs text-gray-500 font-mono">
                        {totalValue > 0 ? ((r.total_value / totalValue) * 100).toFixed(1) : '0.0'}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-700 text-right">الإجمالي</td>
                  <td className="px-4 py-3 font-mono font-bold text-red-700 text-center">{totalValue.toFixed(2)} ر.س</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

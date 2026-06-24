'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { useGlobalLoading } from '@/contexts/globalLoading'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { BrandId } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────

interface BatchItem { sku: string; name: string; unit: string }

interface IngRow {
  ing_sku:     string
  ing_name:    string
  unit:        string
  standardQty: number
  actualQty:   number
  inStock:     number
}

interface Session {
  id:                string
  batch_sku:         string
  batch_name:        string
  qty_portions:      number
  status:            'draft' | 'approved' | 'cancelled'
  performed_by_name: string
  approved_by_name:  string | null
  note:              string | null
  cost_estimate:     number | null
  warnings:          string[]
  created_at:        string
  approved_at:       string | null
}

// ── Helpers ───────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

function StatusBadge({ status }: { status: Session['status'] }) {
  if (status === 'approved')
    return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">معتمدة</span>
  if (status === 'cancelled')
    return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">ملغاة</span>
  return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">مسودة</span>
}

// ── Main Component ────────────────────────────────────────────────────

export default function ProductionClient({ brand }: { brand: BrandId }) {
  const { canEdit, profile } = useUserStore()
  const { startLoading, stopLoading } = useGlobalLoading()
  const canE = canEdit('production')

  const [tab, setTab] = useState<'new' | 'sessions' | 'cost-analysis'>('new')

  // ── Tab A: New production ─────────────────────────────────────────

  const [batches, setBatches]           = useState<BatchItem[]>([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [search, setSearch]             = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedSku, setSelectedSku]   = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [qtyPortions, setQtyPortions]   = useState('1')
  const [rows, setRows]                 = useState<IngRow[]>([])
  const [loadingRecipe, setLoadingRecipe] = useState(false)
  const [recipeError, setRecipeError]   = useState<string | null>(null)
  const [noteInput, setNoteInput]       = useState('')

  const [producing, setProducing]       = useState(false)
  const [result, setResult]             = useState<{ ok: boolean; text: string } | null>(null)

  // ── Tab B: Sessions ───────────────────────────────────────────────

  const [sessions, setSessions]         = useState<Session[]>([])
  const [sessionsTotal, setSessionsTotal] = useState(0)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [sessionsOffset, setSessionsOffset]   = useState(0)
  const LIMIT = 20

  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editNote, setEditNote]         = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMsg, setActionMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)

  // ── Load batches ──────────────────────────────────────────────────

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    const supabase = createClient()
    const { data } = await (supabase.from('batches') as any)
      .select('sku, name, unit').eq('brand_id', brand).order('name')
    setBatches((data ?? []) as BatchItem[])
    setLoadingBatches(false)
  }, [brand])

  // ── Load sessions ─────────────────────────────────────────────────

  const loadSessions = useCallback(async (offset = 0) => {
    setLoadingSessions(true)
    const res = await fetch(`/api/production/sessions?brand_id=${brand}&limit=${LIMIT}&offset=${offset}`)
    if (res.ok) {
      const json = await res.json()
      setSessions(json.sessions ?? [])
      setSessionsTotal(json.total ?? 0)
      setSessionsOffset(offset)
    }
    setLoadingSessions(false)
  }, [brand])

  useEffect(() => { loadBatches() }, [loadBatches])
  useEffect(() => {
    if (tab === 'sessions') loadSessions(0)
  }, [tab, loadSessions])

  // close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Load recipe ───────────────────────────────────────────────────

  const loadRecipe = useCallback(async (batchSku: string, qty: number) => {
    if (!batchSku || qty <= 0) { setRows([]); return }
    setLoadingRecipe(true)
    setRecipeError(null)
    const supabase = createClient()

    const { data: recipe } = await (supabase.from('recipes') as any)
      .select('id, yield_portions')
      .eq('brand_id', brand).eq('sku', batchSku).eq('is_active', true)
      .maybeSingle()

    if (!recipe) {
      setRecipeError('لا توجد وصفة نشطة لهذا الباتش — لا يمكن حساب الكميات القياسية')
      setRows([])
      setLoadingRecipe(false)
      return
    }

    const yieldPortions = Math.max((recipe as any).yield_portions ?? 1, 1)

    const { data: ings } = await (supabase.from('recipe_ingredients') as any)
      .select('ing_sku, ing_name, qty, yield_pct, unit')
      .eq('recipe_id', (recipe as any).id)

    if (!ings?.length) {
      setRecipeError('الوصفة لا تحتوي على مكونات')
      setRows([])
      setLoadingRecipe(false)
      return
    }

    const ingSkus = (ings as any[]).map((i: any) => i.ing_sku)
    const { data: ucRows } = await (supabase.from('unit_conversions') as any)
      .select('ing_sku, factor').eq('brand_id', brand).in('ing_sku', ingSkus)
    const ucMap = new Map<string, number>()
    for (const uc of (ucRows ?? []) as any[]) ucMap.set(uc.ing_sku, uc.factor)

    const computed = (ings as any[])
      .filter(ing => (ing.yield_pct ?? 0) > 0)
      .map(ing => {
        const factor = ucMap.get(ing.ing_sku) ?? 1
        const standardQty = parseFloat(
          (((ing.qty / (ing.yield_pct / 100)) / yieldPortions) * qty / factor).toFixed(4)
        )
        return { ing_sku: ing.ing_sku, ing_name: ing.ing_name, unit: ing.unit ?? '—', standardQty }
      })

    const { data: stockRows } = await (supabase.from('stock_items') as any)
      .select('ing_sku, current_qty')
      .eq('brand_id', brand).in('ing_sku', computed.map(r => r.ing_sku))
    const stockMap = new Map<string, number>()
    for (const s of (stockRows ?? []) as any[]) stockMap.set(s.ing_sku, s.current_qty)

    setRows(computed.map(r => ({
      ...r,
      actualQty: r.standardQty,
      inStock:   stockMap.get(r.ing_sku) ?? 0,
    })))
    setLoadingRecipe(false)
  }, [brand])

  useEffect(() => {
    const qty = parseFloat(qtyPortions) || 0
    loadRecipe(selectedSku, qty)
  }, [selectedSku, qtyPortions, loadRecipe])

  // ── Produce ───────────────────────────────────────────────────────

  const filteredBatches = search.trim()
    ? batches.filter(b =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.sku.toLowerCase().includes(search.toLowerCase()))
    : batches

  const selected = batches.find(b => b.sku === selectedSku)

  function handleActualChange(sku: string, val: string) {
    const qty = parseFloat(val)
    setRows(prev => prev.map(r =>
      r.ing_sku === sku ? { ...r, actualQty: isNaN(qty) ? 0 : qty } : r
    ))
  }

  const allSufficient     = rows.every(r => r.inStock >= r.actualQty)
  const hasSomeInsufficient = rows.some(r => r.inStock < r.actualQty)

  async function handleProduce() {
    if (!selectedSku || !rows.length) return
    setProducing(true); setResult(null)
    startLoading('جارٍ تنفيذ الإنتاج...')
    try {
      const res = await fetch('/api/batches/produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id:     brand,
          batch_sku:    selectedSku,
          qty_portions: parseFloat(qtyPortions) || 1,
          dry_run:      false,
          note:         noteInput || undefined,
          performed_by: profile?.id ?? null,
          actuals:      rows.map(r => ({
            ing_sku: r.ing_sku, ing_name: r.ing_name, unit: r.unit, qty: r.actualQty,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ ok: false, text: data.error ?? 'خطأ في الخادم' })
      } else {
        setResult({ ok: true, text: `تم إنتاج ${data.qty_produced} حصة من "${data.batch_name}" ✓  المخزون الجديد: ${data.batch_new_stock}` })
        setSelectedSku(''); setSearch(''); setRows([])
        setQtyPortions('1'); setNoteInput('')
      }
    } catch {
      setResult({ ok: false, text: 'تعذّر الاتصال بالخادم' })
    } finally {
      setProducing(false)
      stopLoading()
    }
  }

  // ── Sessions actions ──────────────────────────────────────────────

  async function handleApprove(id: string) {
    setActionLoading(id + '_approve')
    setActionMsg(null)
    startLoading('جارٍ اعتماد جلسة الإنتاج...')
    try {
      const res = await fetch(`/api/production/sessions/${id}/approve?brand_id=${brand}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setActionMsg({ ok: true, text: 'تم اعتماد الجلسة' })
        loadSessions(sessionsOffset)
      } else {
        setActionMsg({ ok: false, text: data.error ?? 'خطأ' })
      }
    } finally {
      setActionLoading(null)
      stopLoading()
    }
  }

  function handleDelete(id: string) {
    setDlg({ msg: 'هل أنت متأكد من حذف هذه الجلسة؟ سيتم عكس تأثيرها على المخزون.', onOk: async () => {
      setActionLoading(id + '_delete')
      setActionMsg(null)
      const res = await fetch(`/api/production/sessions/${id}?brand_id=${brand}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setActionMsg({ ok: true, text: 'تم حذف الجلسة وعكس المخزون' })
        loadSessions(sessionsOffset)
      } else {
        setActionMsg({ ok: false, text: data.error ?? 'خطأ' })
      }
      setActionLoading(null)
    }})
  }

  async function handleSaveNote(id: string) {
    setActionLoading(id + '_note')
    setActionMsg(null)
    const res = await fetch(`/api/production/sessions/${id}?brand_id=${brand}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: editNote }),
    })
    const data = await res.json()
    if (res.ok) {
      setActionMsg({ ok: true, text: 'تم تحديث الملاحظة' })
      setEditingId(null)
      loadSessions(sessionsOffset)
    } else {
      setActionMsg({ ok: false, text: data.error ?? 'خطأ' })
    }
    setActionLoading(null)
  }

  // ── Stats for sessions tab ────────────────────────────────────────

  const approvedCount = sessions.filter(s => s.status === 'approved').length
  const draftCount    = sessions.filter(s => s.status === 'draft').length
  const totalPortions = sessions.reduce((acc, s) => acc + s.qty_portions, 0)

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">الإنتاج</h1>
        <p className="text-gray-500 text-sm mt-0.5">تسجيل الإنتاج ومتابعة الجلسات واعتمادها</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('new')}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          إنتاج جديد
        </button>
        <button
          onClick={() => setTab('sessions')}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'sessions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          السجل والإدارة
          {draftCount > 0 && (
            <span className="mr-2 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">{draftCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab('cost-analysis')}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'cost-analysis' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          تحليل التكلفة
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB A: إنتاج جديد                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {tab === 'new' && (
        <div className="space-y-6">

          {result && (
            <div className={`px-4 py-3 rounded-xl text-sm border ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {result.text}
            </div>
          )}

          {/* اختيار الباتش + الكمية */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="text-sm font-semibold text-gray-900">إعداد جلسة الإنتاج</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Batch picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">الباتش</label>
                <div className="relative" ref={dropdownRef}>
                  <input
                    type="text"
                    placeholder={loadingBatches ? 'جارٍ التحميل...' : 'ابحث أو اختر باتش...'}
                    value={selected ? selected.name : search}
                    onChange={e => { setSearch(e.target.value); setSelectedSku(''); setShowDropdown(true) }}
                    onFocus={() => setShowDropdown(true)}
                    disabled={loadingBatches}
                    className={inputCls}
                    autoComplete="off"
                  />
                  {showDropdown && !selected && filteredBatches.length > 0 && (
                    <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden max-h-60 overflow-y-auto">
                      {filteredBatches.map(b => (
                        <button key={b.sku} type="button"
                          onMouseDown={e => {
                            e.preventDefault()
                            setSelectedSku(b.sku); setSearch(''); setShowDropdown(false)
                          }}
                          className="w-full text-right px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0">
                          <div>
                            <span className="font-medium text-gray-900">{b.name}</span>
                            <span className="text-xs text-gray-400 font-mono mr-2">{b.sku}</span>
                          </div>
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{b.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showDropdown && !selected && !loadingBatches && filteredBatches.length === 0 && (
                    <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-sm z-20 px-4 py-3 text-sm text-gray-400">
                      {batches.length === 0 ? 'لا توجد باتشات مضافة بعد' : 'لا توجد نتائج'}
                    </div>
                  )}
                </div>
                {selected && (
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">{selected.sku}</span>
                    <button onClick={() => { setSelectedSku(''); setRows([]) }} className="text-gray-400 hover:text-red-500">✕</button>
                  </div>
                )}
              </div>

              {/* عدد الحصص */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">عدد الحصص المنتجة</label>
                <input
                  type="number" min="0.001" step="0.001"
                  value={qtyPortions}
                  onChange={e => setQtyPortions(e.target.value)}
                  className={inputCls}
                />
                <p className="text-xs text-gray-400">يحدد الكميات القياسية — يمكنك تعديل الفعلي أدناه</p>
              </div>
            </div>
          </div>

          {/* جدول المكونات */}
          {selectedSku && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">مكونات الإنتاج</span>
                {hasSomeInsufficient && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠ بعض المواد غير كافية</span>
                )}
                {allSufficient && rows.length > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ جميع المواد كافية</span>
                )}
              </div>

              {loadingRecipe ? (
                <div className="px-5 py-10 text-center text-gray-400 text-sm">جارٍ تحميل الوصفة...</div>
              ) : recipeError ? (
                <div className="px-5 py-8 text-center text-amber-600 text-sm">{recipeError}</div>
              ) : rows.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">اختر باتشاً لعرض مكوناته</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-right px-4 py-2.5 font-medium">المادة</th>
                      <th className="text-center px-4 py-2.5 font-medium">الوحدة</th>
                      <th className="text-center px-4 py-2.5 font-medium">القياسي</th>
                      <th className="text-center px-4 py-2.5 font-medium">الفعلي</th>
                      <th className="text-center px-4 py-2.5 font-medium">في المخزون</th>
                      <th className="text-center px-4 py-2.5 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const sufficient = r.inStock >= r.actualQty
                      const diff = r.actualQty - r.standardQty
                      return (
                        <tr key={r.ing_sku} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-gray-900">{r.ing_name}</div>
                            <div className="text-xs text-gray-400 font-mono">{r.ing_sku}</div>
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{r.unit}</td>
                          <td className="px-4 py-2.5 text-center font-mono text-gray-500">{r.standardQty.toFixed(3)}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="number" min="0" step="0.001"
                                value={r.actualQty}
                                onChange={e => handleActualChange(r.ing_sku, e.target.value)}
                                className={`w-24 border rounded-lg px-2 py-1 text-sm text-center focus:outline-none font-mono transition-colors ${
                                  sufficient ? 'border-gray-200 focus:border-blue-400' : 'border-red-300 focus:border-red-400 bg-red-50'
                                }`}
                              />
                              {Math.abs(diff) > 0.001 && (
                                <span className={`text-[10px] font-mono ${diff > 0 ? 'text-orange-500' : 'text-blue-500'}`}>
                                  {diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`px-4 py-2.5 text-center font-mono font-semibold ${sufficient ? 'text-green-600' : 'text-red-600'}`}>
                            {r.inStock.toFixed(3)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {sufficient ? (
                              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">كافٍ</span>
                            ) : (
                              <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                عجز {(r.actualQty - r.inStock).toFixed(3)}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* تأكيد الإنتاج */}
          {rows.length > 0 && canE && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">ملاحظة (اختياري)</label>
                <input type="text" value={noteInput} onChange={e => setNoteInput(e.target.value)}
                  placeholder="مثال: دفعة الصباح" className={inputCls} />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleProduce}
                  disabled={producing}
                  className={`px-5 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-40 ${
                    allSufficient ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  {producing ? 'جارٍ الإنتاج...' : allSufficient ? '✓ تأكيد الإنتاج' : '⚠ إنتاج مع عجز في المواد'}
                </button>
                {hasSomeInsufficient && (
                  <span className="text-xs text-amber-600">سيتم الإنتاج وقد ينتج مخزون سالب</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB B: السجل والإدارة                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {tab === 'sessions' && (
        <div className="space-y-5">

          {/* Action feedback */}
          {actionMsg && (
            <div className={`px-4 py-3 rounded-xl text-sm border ${actionMsg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {actionMsg.text}
            </div>
          )}

          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">إجمالي الجلسات</div>
              <div className="text-2xl font-bold text-gray-900">{sessionsTotal}</div>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-4">
              <div className="text-xs text-amber-600 mb-1">بانتظار الاعتماد</div>
              <div className="text-2xl font-bold text-amber-700">{draftCount}</div>
            </div>
            <div className="bg-white border border-green-200 rounded-xl p-4">
              <div className="text-xs text-green-600 mb-1">إجمالي الحصص (هذه الصفحة)</div>
              <div className="text-2xl font-bold text-green-700">{totalPortions.toFixed(1)}</div>
            </div>
          </div>

          {/* Sessions table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="font-semibold text-gray-900 text-sm">جلسات الإنتاج</span>
              <button
                onClick={() => loadSessions(sessionsOffset)}
                className="text-xs text-blue-600 hover:underline"
              >
                تحديث
              </button>
            </div>

            {loadingSessions ? (
              <div className="py-12 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
            ) : sessions.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">لا توجد جلسات إنتاج بعد</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-right px-4 py-2.5 font-medium">الباتش</th>
                      <th className="text-center px-4 py-2.5 font-medium">الكمية</th>
                      <th className="text-right px-4 py-2.5 font-medium">المنفذ</th>
                      <th className="text-right px-4 py-2.5 font-medium">الملاحظة</th>
                      <th className="text-center px-4 py-2.5 font-medium">الحالة</th>
                      <th className="text-center px-4 py-2.5 font-medium">التاريخ</th>
                      {canE && <th className="text-center px-4 py-2.5 font-medium">إجراءات</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => (
                      <React.Fragment key={s.id}>
                        <tr className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{s.batch_name}</div>
                            <div className="text-xs text-gray-400 font-mono">{s.batch_sku}</div>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-semibold text-blue-700">
                            {s.qty_portions}
                            {s.cost_estimate != null && (
                              <div className="text-xs font-normal text-gray-400">
                                {s.cost_estimate.toFixed(2)} ر.س
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.performed_by_name}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px]">
                            {editingId === s.id ? (
                              <div className="flex gap-1">
                                <input
                                  value={editNote}
                                  onChange={e => setEditNote(e.target.value)}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-blue-400"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveNote(s.id)}
                                  disabled={actionLoading === s.id + '_note'}
                                  aria-label="حفظ الملاحظة"
                                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded disabled:opacity-40"
                                >
                                  {actionLoading === s.id + '_note' ? '...' : '✓'}
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  aria-label="إلغاء"
                                  className="text-xs text-gray-400 hover:text-red-500 px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span className="truncate block">{s.note ?? '—'}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={s.status} />
                            {s.status === 'approved' && s.approved_by_name && (
                              <div className="text-[10px] text-gray-400 mt-0.5">{s.approved_by_name}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 text-center whitespace-nowrap">
                            {new Date(s.created_at).toLocaleDateString('ar-SA')}
                            <br />
                            {new Date(s.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          {canE && (
                            <td className="px-4 py-3 text-center">
                              {s.status === 'draft' ? (
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  {/* اعتماد */}
                                  <button
                                    onClick={() => handleApprove(s.id)}
                                    disabled={!!actionLoading}
                                    title="اعتماد الجلسة"
                                    className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg disabled:opacity-40 transition-colors"
                                  >
                                    {actionLoading === s.id + '_approve' ? '...' : 'اعتماد'}
                                  </button>
                                  {/* تعديل الملاحظة */}
                                  <button
                                    onClick={() => { setEditingId(s.id); setEditNote(s.note ?? '') }}
                                    title="تعديل الملاحظة"
                                    className="text-xs border border-gray-300 hover:border-blue-400 text-gray-600 hover:text-blue-600 px-2.5 py-1 rounded-lg transition-colors"
                                  >
                                    تعديل
                                  </button>
                                  {/* حذف */}
                                  <button
                                    onClick={() => handleDelete(s.id)}
                                    disabled={!!actionLoading}
                                    title="حذف الجلسة وعكس المخزون"
                                    className="text-xs border border-red-200 hover:bg-red-50 text-red-500 px-2.5 py-1 rounded-lg disabled:opacity-40 transition-colors"
                                  >
                                    {actionLoading === s.id + '_delete' ? '...' : 'حذف'}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                        {/* تحذيرات المخزون */}
                        {s.warnings?.length > 0 && (
                          <tr className="bg-amber-50/50">
                            <td colSpan={canE ? 7 : 6} className="px-4 py-2">
                              <div className="text-xs text-amber-700 flex flex-wrap gap-2">
                                <span className="font-medium">⚠ تحذيرات:</span>
                                {s.warnings.map((w, wi) => (
                                  <span key={wi} className="bg-amber-100 px-2 py-0.5 rounded">{w}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                </div>

                {/* Pagination */}
                {sessionsTotal > LIMIT && (
                  <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {sessionsOffset + 1}–{Math.min(sessionsOffset + LIMIT, sessionsTotal)} من {sessionsTotal}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={sessionsOffset === 0}
                        onClick={() => loadSessions(sessionsOffset - LIMIT)}
                        className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                      >
                        السابق
                      </button>
                      <button
                        disabled={sessionsOffset + LIMIT >= sessionsTotal}
                        onClick={() => loadSessions(sessionsOffset + LIMIT)}
                        className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                      >
                        التالي
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'cost-analysis' && <CostAnalysisTab brand={brand} />}

      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}

// ── Cost Analysis Tab ─────────────────────────────────────────────

interface CostRow {
  id: string; batch_name: string; batch_sku: string
  qty_portions: number; approved_at: string
  estimate: number; actual: number
}

function CostAnalysisTab({ brand }: { brand: BrandId }) {
  const [rows, setRows]       = useState<CostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [months, setMonths]   = useState(3)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const since = new Date()
    since.setMonth(since.getMonth() - months)

    const [{ data: sessions }, { data: movements }] = await Promise.all([
      (supabase.from('production_sessions') as any)
        .select('id, batch_sku, batch_name, qty_portions, approved_at, actuals_json')
        .eq('brand_id', brand)
        .eq('status', 'approved')
        .not('actuals_json', 'is', null)
        .gte('approved_at', since.toISOString())
        .order('approved_at', { ascending: false }),
      (supabase.from('stock_movements') as any)
        .select('production_session_id, value')
        .eq('brand_id', brand)
        .eq('movement_type', 'out')
        .not('production_session_id', 'is', null)
        .gte('created_at', since.toISOString()),
    ])

    // Sum actual costs per session
    const actualMap = new Map<string, number>()
    for (const m of (movements ?? []) as any[]) {
      if (!m.production_session_id) continue
      actualMap.set(m.production_session_id, (actualMap.get(m.production_session_id) ?? 0) + (m.value ?? 0))
    }

    const result: CostRow[] = ((sessions ?? []) as any[])
      .filter((s: any) => s.actuals_json?.batch_value != null)
      .map((s: any) => ({
        id:           s.id,
        batch_name:   s.batch_name,
        batch_sku:    s.batch_sku,
        qty_portions: s.qty_portions,
        approved_at:  s.approved_at,
        estimate:     s.actuals_json.batch_value ?? 0,
        actual:       actualMap.get(s.id) ?? 0,
      }))

    setRows(result)
    setLoading(false)
  }, [brand, months])

  useEffect(() => { load() }, [load])

  const totalEstimate = rows.reduce((s, r) => s + r.estimate, 0)
  const totalActual   = rows.reduce((s, r) => s + r.actual, 0)
  const avgVariancePct = rows.length > 0
    ? rows.filter(r => r.estimate > 0).reduce((s, r) => s + ((r.actual - r.estimate) / r.estimate) * 100, 0) / rows.filter(r => r.estimate > 0).length
    : 0

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">جارٍ التحميل...</div>

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">الفترة:</span>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[1, 3, 6].map(n => (
            <button key={n} onClick={() => setMonths(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${months === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {n === 1 ? 'شهر' : `${n} أشهر`}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">إجمالي التقدير</p>
          <p className="text-xl font-bold text-gray-700 font-mono mt-1">{totalEstimate.toFixed(2)} <span className="text-sm font-normal">ر.س</span></p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">إجمالي الفعلي</p>
          <p className="text-xl font-bold text-blue-700 font-mono mt-1">{totalActual.toFixed(2)} <span className="text-sm font-normal">ر.س</span></p>
        </div>
        <div className={`border rounded-xl p-4 ${avgVariancePct > 10 ? 'bg-red-50 border-red-100' : avgVariancePct > 0 ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
          <p className="text-xs text-gray-500 font-medium">متوسط الانحراف</p>
          <p className={`text-xl font-bold font-mono mt-1 ${avgVariancePct > 10 ? 'text-red-700' : avgVariancePct > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {avgVariancePct > 0 ? '+' : ''}{avgVariancePct.toFixed(1)}%
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          لا توجد جلسات معتمدة في هذه الفترة تحتوي على بيانات تكلفة
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="text-right px-4 py-3 font-medium">الباتش</th>
                <th className="text-center px-4 py-3 font-medium">الحصص</th>
                <th className="text-center px-4 py-3 font-medium">تاريخ الاعتماد</th>
                <th className="text-center px-4 py-3 font-medium">التقدير</th>
                <th className="text-center px-4 py-3 font-medium">الفعلي</th>
                <th className="text-center px-4 py-3 font-medium">الفرق</th>
                <th className="text-center px-4 py-3 font-medium">% الانحراف</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const diff    = r.actual - r.estimate
                const diffPct = r.estimate > 0 ? (diff / r.estimate) * 100 : 0
                const isOver  = diff > 0
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-900">{r.batch_name}</span>
                      <span className="text-[10px] text-gray-400 block font-mono">{r.batch_sku}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-gray-700">{r.qty_portions}</td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                      {new Date(r.approved_at).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-600">{r.estimate.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-xs font-semibold text-blue-700">{r.actual.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-xs">
                      <span className={diff === 0 ? 'text-gray-400' : isOver ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {r.estimate > 0 ? (
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                          Math.abs(diffPct) < 3 ? 'bg-green-50 text-green-600'
                          : isOver ? 'bg-red-50 text-red-600'
                          : 'bg-blue-50 text-blue-600'
                        }`}>
                          {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-700 text-right">الإجمالي</td>
                <td className="px-4 py-3 font-mono text-xs text-center text-gray-600">{totalEstimate.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono text-xs text-center font-bold text-blue-700">{totalActual.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono text-xs text-center font-semibold">
                  <span className={totalActual - totalEstimate > 0 ? 'text-red-600' : 'text-green-600'}>
                    {totalActual - totalEstimate > 0 ? '+' : ''}{(totalActual - totalEstimate).toFixed(2)}
                  </span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

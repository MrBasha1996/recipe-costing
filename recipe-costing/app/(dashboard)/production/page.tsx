'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'

interface BatchProduct {
  sku: string
  name: string
  unit: string | null
  category: string
}

interface IngredientReport {
  sku: string
  name: string
  unit: string
  needed: number
  in_stock: number
  deficit: number
  sufficient: boolean
  is_semi: boolean
}

interface PreviewData {
  batch_sku: string
  batch_name: string
  qty_portions: number
  yield_portions: number
  ingredients: IngredientReport[]
  all_sufficient: boolean
  cost_estimate: number
  batch_current_stock: number
}

interface ProductionLog {
  id: string
  ing_sku: string
  ing_name: string
  qty: number
  note: string | null
  created_at: string
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

export default function ProductionPage() {
  const { brand } = useBrandStore()
  const { canEdit, profile } = useUserStore()
  const canE = canEdit('production')

  const [batches, setBatches] = useState<BatchProduct[]>([])
  const [log, setLog] = useState<ProductionLog[]>([])
  const [loadingBatches, setLoadingBatches] = useState(true)

  const [selectedSku, setSelectedSku] = useState('')
  const [qtyInput, setQtyInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [search, setSearch] = useState('')

  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [producing, setProducing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    const supabase = createClient()
    const { data } = await (supabase.from('products') as any)
      .select('sku, name, unit, category')
      .eq('brand_id', brand)
      .or('is_semi.eq.true,category.eq.Batch')
      .order('name')
    setBatches((data || []) as BatchProduct[])
    setLoadingBatches(false)
  }, [brand])

  const loadLog = useCallback(async () => {
    const supabase = createClient()
    const { data } = await (supabase.from('stock_movements') as any)
      .select('id, ing_sku, ing_name, qty, note, created_at')
      .eq('brand_id', brand)
      .eq('movement_type', 'in')
      .ilike('note', 'إنتاج باتش%')
      .order('created_at', { ascending: false })
      .limit(30)
    setLog((data || []) as ProductionLog[])
  }, [brand])

  useEffect(() => {
    loadBatches()
    loadLog()
  }, [loadBatches, loadLog])

  const filteredBatches = search
    ? batches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.sku.toLowerCase().includes(search.toLowerCase()))
    : batches

  const selected = batches.find(b => b.sku === selectedSku)

  async function handlePreview() {
    if (!selectedSku || !qtyInput || Number(qtyInput) <= 0) return
    setPreviewing(true); setPreview(null); setResult(null)
    const res = await fetch('/api/batches/produce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_id: brand, batch_sku: selectedSku, qty_portions: Number(qtyInput), dry_run: true }),
    })
    const data = await res.json()
    if (!res.ok) { setResult({ ok: false, text: data.error }); setPreviewing(false); return }
    setPreview(data as PreviewData)
    setPreviewing(false)
  }

  async function handleProduce() {
    if (!preview) return
    setProducing(true); setResult(null)
    const res = await fetch('/api/batches/produce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brand, batch_sku: preview.batch_sku,
        qty_portions: preview.qty_portions, dry_run: false,
        note: noteInput || undefined,
        performed_by: profile?.id ?? null,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setResult({ ok: false, text: data.error }); setProducing(false); return }
    setResult({ ok: true, text: `تم إنتاج ${data.qty_produced} حصة من "${data.batch_name}" ✓  المخزون الجديد: ${data.batch_new_stock}` })
    setPreview(null); setQtyInput(''); setNoteInput(''); setSearch('')
    setProducing(false)
    loadLog()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">واجهة الإنتاج</h1>
        <p className="text-gray-500 text-sm mt-0.5">إنتاج الباتشات وخصم المواد الخام تلقائياً</p>
      </div>

      {result && (
        <div className={`px-4 py-3 rounded-xl text-sm border ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {result.text}
        </div>
      )}

      {/* ── نموذج الإنتاج ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="text-sm font-semibold text-gray-900">جلسة إنتاج جديدة</div>

        {/* اختيار الباتش */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">الباتش</label>
            <input
              type="text"
              placeholder="ابحث باسم الباتش أو SKU..."
              value={selected ? selected.name : search}
              onChange={e => { setSearch(e.target.value); setSelectedSku(''); setPreview(null) }}
              className={inputCls}
            />
            {filteredBatches.length > 0 && !selected && search && (
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                {filteredBatches.slice(0, 8).map(b => (
                  <button key={b.sku} type="button"
                    onClick={() => { setSelectedSku(b.sku); setSearch(''); setPreview(null) }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-900">{b.name}</span>
                      <span className="text-xs text-gray-400 font-mono mr-2">{b.sku}</span>
                    </div>
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{b.unit ?? '—'}</span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">{selected.sku}</span>
                <button onClick={() => { setSelectedSku(''); setPreview(null) }} className="text-gray-400 hover:text-red-500">✕</button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">الكمية المراد إنتاجها (حصص)</label>
            <input
              type="number" min="0.001" step="0.001" value={qtyInput}
              onChange={e => { setQtyInput(e.target.value); setPreview(null) }}
              placeholder="مثال: 10"
              className={inputCls}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">ملاحظة (اختياري)</label>
          <input type="text" value={noteInput} onChange={e => setNoteInput(e.target.value)}
            placeholder="مثال: إنتاج لتغطية طلبات اليوم"
            className={inputCls}
          />
        </div>

        <button
          onClick={handlePreview}
          disabled={previewing || !selectedSku || !qtyInput || Number(qtyInput) <= 0}
          className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
        >
          {previewing ? 'جارٍ الحساب...' : 'معاينة الإنتاج'}
        </button>
      </div>

      {/* ── المعاينة ──────────────────────────────────────────────── */}
      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="font-semibold text-gray-900">{preview.batch_name}</span>
              <span className="text-xs text-gray-500 mr-2">إنتاج {preview.qty_portions} حصة</span>
              {!preview.all_sufficient && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full mr-2">⚠ بعض المواد غير كافية</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">المخزون الحالي: <span className="font-mono font-semibold">{preview.batch_current_stock}</span></span>
              <span className="text-xs text-gray-500">التكلفة التقديرية: <span className="font-mono font-semibold text-blue-700">{preview.cost_estimate.toFixed(2)} ر.س</span></span>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <th className="text-right px-4 py-2.5 font-medium">المادة</th>
                <th className="text-center px-4 py-2.5 font-medium">المطلوب</th>
                <th className="text-center px-4 py-2.5 font-medium">في المخزون</th>
                <th className="text-center px-4 py-2.5 font-medium">العجز</th>
                <th className="text-center px-4 py-2.5 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {preview.ingredients.map((ing, i) => (
                <tr key={ing.sku} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{ing.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{ing.sku}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-700">{ing.needed.toFixed(3)} <span className="text-xs text-gray-400">{ing.unit}</span></td>
                  <td className={`px-4 py-2.5 text-center font-mono font-semibold ${ing.sufficient ? 'text-green-600' : 'text-red-600'}`}>
                    {ing.in_stock.toFixed(3)}
                  </td>
                  <td className={`px-4 py-2.5 text-center font-mono text-sm ${ing.deficit > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
                    {ing.deficit > 0 ? `-${ing.deficit.toFixed(3)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ing.sufficient ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {ing.sufficient ? 'كافٍ' : 'ناقص'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
            {canE && (
              <button onClick={handleProduce} disabled={producing}
                className={`px-5 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-40 ${preview.all_sufficient ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
                {producing ? 'جارٍ الإنتاج...' : preview.all_sufficient ? '✓ تأكيد الإنتاج' : '⚠ إنتاج مع عجز في المواد'}
              </button>
            )}
            <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
              إلغاء
            </button>
            {!preview.all_sufficient && (
              <span className="text-xs text-amber-600">سيتم الإنتاج وقد ينتج مخزون سالب في المواد الناقصة</span>
            )}
          </div>
        </div>
      )}

      {/* ── سجل الإنتاج ───────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <span className="font-semibold text-gray-900 text-sm">سجل الإنتاج الأخير</span>
        </div>
        {log.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-400 text-sm">لا توجد جلسات إنتاج بعد</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <th className="text-right px-4 py-2.5 font-medium">الباتش</th>
                <th className="text-center px-4 py-2.5 font-medium">الكمية</th>
                <th className="text-right px-4 py-2.5 font-medium">الملاحظة</th>
                <th className="text-right px-4 py-2.5 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={l.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{l.ing_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{l.ing_sku}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-green-700">+{l.qty}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{l.note ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleDateString('ar-SA')} {new Date(l.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

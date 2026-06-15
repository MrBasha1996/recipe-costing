'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { usePermissionsStore } from '@/stores/permissionsStore'
import { downloadPurchasesTemplate, parsePurchasesFile, validatePurchaseRows } from '@/lib/excel'
import { parseFoodicsFile } from '@/lib/parseFoodics'
import type { PurchaseRow, BrandId } from '@/types'

type ViewTab = 'import' | 'analytics'

interface BatchSummary {
  import_batch: string; purchase_date: string; supplier_name: string
  item_count: number; total_amount: number; imported_at: string
}

interface ConversionRow { ing_sku: string; factor: number; buy_unit: string; recipe_unit: string }

interface Props {
  initialBatches: BatchSummary[]
  conversionRows: ConversionRow[]
  brand: BrandId
}

export default function PurchasingClient({ initialBatches, conversionRows, brand }: Props) {
  const router = useRouter()
  const { profile } = useUserStore()
  const { isSuperAdmin, hasPermission } = usePermissionsStore()
  const canImport = isSuperAdmin || hasPermission('purchasing', 'import')
  const fileRef = useRef<HTMLInputElement>(null)

  const [viewTab, setViewTab] = useState<ViewTab>('import')
  const [batches, setBatches] = useState<BatchSummary[]>(initialBatches)
  const [preview, setPreview] = useState<PurchaseRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [updatePrices, setUpdatePrices] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null)

  useEffect(() => { setBatches(initialBatches) }, [initialBatches])

  const conversions = new Map(conversionRows.map(r => [r.ing_sku, r]))

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null); setImportMsg(null)
    try {
      const foodics = await parseFoodicsFile(file)
      if (foodics.type === 'purchases' && foodics.purchases.length > 0) {
        const rows = foodics.purchases.map(r => {
          const conv = r.ing_sku ? conversions.get(r.ing_sku) : undefined
          if (conv && r.qty > 0) return { ...r, unit_cost: r.total_price / (r.qty * conv.factor) }
          return r
        })
        const { valid: vRows, errors: vErrs } = validatePurchaseRows(rows)
        if (vErrs.length) setParseError(`تحذير: ${vErrs.length} سطر بيانات غير صالحة — ${vErrs[0]}`)
        if (vRows.length === 0) { setParseError('جميع الأسطر تحتوي على بيانات غير صالحة'); return }
        setPreview(vRows)
      } else {
        const rows = await parsePurchasesFile(file)
        if (rows.length === 0) { setParseError('لم يتم العثور على بيانات صالحة في الملف'); return }
        const { valid: vRows, errors: vErrs } = validatePurchaseRows(rows)
        if (vErrs.length) setParseError(`تحذير: ${vErrs.length} سطر بيانات غير صالحة — ${vErrs[0]}`)
        if (vRows.length === 0) { setParseError('جميع الأسطر تحتوي على بيانات غير صالحة'); return }
        setPreview(vRows)
      }
    } catch (err: any) { setParseError(err.message) }
    e.target.value = ''
  }

  async function handleImport() {
    if (preview.length === 0) return
    setImporting(true); setImportMsg(null)
    try {
      const supabase = createClient()
      const batchId = crypto.randomUUID()
      const rows = preview.map(r => ({
        brand_id: brand as string, purchase_date: r.purchase_date, supplier_name: r.supplier_name,
        ing_sku: r.ing_sku || null, ing_name: r.ing_name, qty: r.qty, unit: r.unit,
        total_price: r.total_price, unit_cost: r.unit_cost,
        import_batch: batchId, imported_by: profile?.id ?? null,
      }))
      const { error } = await (supabase.from('purchases') as any).insert(rows)
      if (error) throw error

      if (updatePrices) {
        const user = (await supabase.auth.getUser()).data.user
        const res = await fetch('/api/purchases/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_id: brand, import_batch: batchId, performed_by: user?.id }),
        })
        const data = await res.json()
        const priceNote = data.updated > 0 ? ` · تحديث WAC لـ ${data.updated} صنف` : ''
        setImportMsg({ ok: true, text: `تم استيراد ${rows.length} صنف بنجاح${priceNote}` })
      } else {
        setImportMsg({ ok: true, text: `تم استيراد ${rows.length} صنف بنجاح` })
      }
      setPreview([])
      router.refresh()
    } catch (err: any) {
      setImportMsg({ ok: false, text: `خطأ: ${err.message}` })
    } finally { setImporting(false) }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm('حذف هذه الدفعة من سجل المشتريات؟')) return
    setDeletingBatch(batchId)
    const supabase = createClient()
    await (supabase.from('purchases') as any).delete().eq('import_batch', batchId)
    setDeletingBatch(null)
    router.refresh()
  }

  const totalPreview = preview.reduce((s, r) => s + r.total_price, 0)
  const suppliers = [...new Set(preview.map(r => r.supplier_name).filter(Boolean))]

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">استيراد المشتريات</h1>
          <p className="text-gray-500 text-sm mt-0.5">استيراد فواتير الشراء من Excel وتحديث أسعار المواد تلقائياً</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border ${
            brand === 'ti' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <span>البراند:</span>
            <span>{brand === 'ti' ? 'Three In 🍔' : 'باب البلد 🫕'}</span>
          </div>
          <button onClick={() => downloadPurchasesTemplate().catch(console.error)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
            ⬇ تنزيل القالب
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {([['import', 'الاستيراد والسجل'], ['analytics', 'تحليل المشتريات']] as [ViewTab, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setViewTab(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewTab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {viewTab === 'analytics' && <PurchaseAnalytics brand={brand} />}

      {viewTab === 'import' && (<>
      <div onClick={() => canImport && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors bg-white ${canImport ? 'border-gray-300 hover:border-blue-400 cursor-pointer' : 'border-gray-200 opacity-50 cursor-not-allowed'}`}>
        <div className="text-4xl mb-3">📂</div>
        <p className="text-gray-600 font-medium">اضغط لاختيار ملف</p>
        <p className="text-gray-400 text-sm mt-1">Foodics — تاريخ المخزون · أو Excel عام</p>
        <div className="flex items-center justify-center gap-3 mt-3">
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">📦 Foodics تاريخ المخزون</span>
          <span className="text-xs bg-gray-50 text-gray-500 px-2 py-1 rounded-full">📄 Excel عام</span>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{parseError}</div>
      )}

      {preview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-gray-900">معاينة — {preview.length} صنف</span>
              <span className="text-sm text-gray-500">إجمالي: <span className="font-mono font-semibold text-gray-800">{totalPreview.toFixed(2)} ر.س</span></span>
              {suppliers.length > 0 && <span className="text-sm text-gray-500">الموردون: {suppliers.join('، ')}</span>}
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={updatePrices} onChange={e => setUpdatePrices(e.target.checked)} className="accent-blue-500" />
              تحديث أسعار المواد الخام تلقائياً
            </label>
          </div>
          <div className="overflow-x-auto">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-4 py-2.5 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-2.5 font-medium">المورد</th>
                  <th className="text-right px-4 py-2.5 font-medium">SKU</th>
                  <th className="text-right px-4 py-2.5 font-medium">المادة</th>
                  <th className="text-left px-4 py-2.5 font-medium">الكمية</th>
                  <th className="text-left px-4 py-2.5 font-medium">إجمالي</th>
                  <th className="text-left px-4 py-2.5 font-medium">تكلفة/وحدة</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{r.purchase_date}</td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs">{r.supplier_name}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.ing_sku}</td>
                    <td className="px-4 py-2.5 text-gray-900 font-medium text-xs">{r.ing_name}</td>
                    <td className="px-4 py-2.5 text-left text-gray-600 font-mono text-xs">{r.qty} {r.unit}</td>
                    <td className="px-4 py-2.5 text-left font-mono font-semibold text-gray-800 text-xs">{r.total_price.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-left font-mono text-xs">
                      {r.unit_cost > 0 ? (
                        <div>
                          <span className="text-blue-700">{r.unit_cost.toFixed(6)}</span>
                          {r.ing_sku && conversions.has(r.ing_sku) && (
                            <div className="text-gray-400 text-xs leading-none mt-0.5">
                              ÷ {conversions.get(r.ing_sku)!.factor} → {conversions.get(r.ing_sku)!.recipe_unit}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-500">⚠ غير محدد</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
            {importMsg && (
              <span className={`text-sm ${importMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{importMsg.text}</span>
            )}
            <div className="flex gap-2 mr-auto">
              <button onClick={() => setPreview([])} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
              <button onClick={handleImport} disabled={importing}
                className="text-sm px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
                {importing ? 'جارٍ الاستيراد...' : `استيراد ${preview.length} صنف`}
              </button>
            </div>
          </div>
        </div>
      )}

      {importMsg && preview.length === 0 && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${importMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {importMsg.text}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <span className="font-semibold text-gray-900">سجل الاستيراد</span>
        </div>
        {batches.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">لا توجد عمليات استيراد سابقة</div>
        ) : (
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <th className="text-right px-4 py-2.5 font-medium">التاريخ</th>
                <th className="text-right px-4 py-2.5 font-medium">المورد</th>
                <th className="text-center px-4 py-2.5 font-medium">الأصناف</th>
                <th className="text-left px-4 py-2.5 font-medium">الإجمالي</th>
                <th className="text-left px-4 py-2.5 font-medium">وقت الاستيراد</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.import_batch} className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
                  onClick={() => router.push(`/${brand}/purchasing/${b.import_batch}`)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.purchase_date}</td>
                  <td className="px-4 py-3 text-gray-800">{b.supplier_name}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{b.item_count}</td>
                  <td className="px-4 py-3 text-left font-mono font-semibold text-gray-800">{b.total_amount.toFixed(2)} ر.س</td>
                  <td className="px-4 py-3 text-left text-xs text-gray-400 font-mono">{new Date(b.imported_at).toLocaleString('en-US')}</td>
                  <td className="px-4 py-3 text-left" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleDeleteBatch(b.import_batch)} disabled={deletingBatch === b.import_batch}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>)}
    </div>
  )
}

// ── Purchase Analytics ─────────────────────────────────────────────

function PurchaseAnalytics({ brand }: { brand: BrandId }) {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [months, setMonths]   = useState(6)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const since = new Date()
    since.setMonth(since.getMonth() - months)
    const { data } = await (supabase.from('purchases') as any)
      .select('purchase_date, supplier_name, ing_sku, ing_name, total_price, unit_cost, qty, unit')
      .eq('brand_id', brand)
      .gte('purchase_date', since.toISOString().slice(0, 10))
      .order('purchase_date', { ascending: true })
    setRows((data || []) as any[])
    setLoading(false)
  }, [brand, months])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">جارٍ التحليل...</div>
  if (!rows.length) return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
      لا توجد بيانات مشتريات في هذه الفترة
    </div>
  )

  // ── Monthly trend ────────────────────────────────────────────────
  const monthlyMap = new Map<string, number>()
  for (const r of rows) {
    const m = r.purchase_date.slice(0, 7)
    monthlyMap.set(m, (monthlyMap.get(m) ?? 0) + r.total_price)
  }
  const monthlyData = [...monthlyMap.entries()].sort().map(([m, v]) => {
    const [y, mo] = m.split('-')
    const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' })
    return { month: label, value: Math.round(v) }
  })

  // ── By supplier ──────────────────────────────────────────────────
  const supplierMap = new Map<string, number>()
  for (const r of rows) {
    const s = r.supplier_name || 'غير محدد'
    supplierMap.set(s, (supplierMap.get(s) ?? 0) + r.total_price)
  }
  const topSuppliers = [...supplierMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const totalSupplier = topSuppliers.reduce((s, [, v]) => s + v, 0)

  // ── Top ingredients ──────────────────────────────────────────────
  const ingMap = new Map<string, { name: string; total: number; qty: number; unit: string }>()
  for (const r of rows) {
    const key = r.ing_sku || r.ing_name
    const ex = ingMap.get(key)
    if (ex) { ex.total += r.total_price; ex.qty += r.qty }
    else ingMap.set(key, { name: r.ing_name, total: r.total_price, qty: r.qty, unit: r.unit ?? '' })
  }
  const topIngs = [...ingMap.values()].sort((a, b) => b.total - a.total).slice(0, 10)
  const grandTotal = rows.reduce((s, r) => s + r.total_price, 0)

  // ── Price volatility ─────────────────────────────────────────────
  const priceHistory = new Map<string, { name: string; unit: string; prices: { date: string; cost: number }[] }>()
  for (const r of rows) {
    if (!r.ing_sku || !r.unit_cost) continue
    const ex = priceHistory.get(r.ing_sku)
    if (ex) ex.prices.push({ date: r.purchase_date, cost: r.unit_cost })
    else priceHistory.set(r.ing_sku, { name: r.ing_name, unit: r.unit ?? '', prices: [{ date: r.purchase_date, cost: r.unit_cost }] })
  }
  const volatile = [...priceHistory.entries()]
    .map(([sku, d]) => {
      const sorted = d.prices.sort((a, b) => a.date.localeCompare(b.date))
      const first = sorted[0].cost
      const last  = sorted[sorted.length - 1].cost
      const pct   = first > 0 ? ((last - first) / first) * 100 : 0
      return { sku, name: d.name, unit: d.unit, first, last, pct }
    })
    .filter(r => Math.abs(r.pct) >= 5)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 8)

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">الفترة:</span>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[3, 6, 12].map(n => (
            <button key={n} onClick={() => setMonths(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${months === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {n} أشهر
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">إجمالي: <span className="font-mono font-semibold text-gray-700">{grandTotal.toFixed(0)} ر.س</span></span>
      </div>

      {/* Monthly trend */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 mb-3">الإنفاق الشهري على المشتريات (ر.س)</p>
        <div className="flex items-end gap-1 h-28">
          {monthlyData.map(d => {
            const maxVal = Math.max(...monthlyData.map(x => x.value), 1)
            const pct = (d.value / maxVal) * 100
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className="text-[9px] text-gray-500 font-mono">{d.value > 999 ? `${(d.value / 1000).toFixed(1)}k` : d.value}</span>
                <div className="w-full bg-blue-500 rounded-t" style={{ height: `${Math.max(pct, 3)}%` }} />
                <span className="text-[9px] text-gray-400 truncate w-full text-center">{d.month}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top suppliers */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">أكبر الموردين بالإنفاق</span>
          </div>
          <div className="divide-y divide-gray-50">
            {topSuppliers.map(([name, value], i) => (
              <div key={name} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-xs text-gray-400 w-4 font-mono">{i + 1}</span>
                <span className="flex-1 text-sm text-gray-800 font-medium truncate">{name}</span>
                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(value / totalSupplier) * 100}%` }} />
                </div>
                <span className="text-xs font-mono font-semibold text-blue-700 w-20 text-left">{value.toFixed(0)} ر.س</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top ingredients */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">أعلى 10 مواد بالإنفاق</span>
          </div>
          <div className="divide-y divide-gray-50">
            {topIngs.map((ing, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-xs text-gray-400 w-4 font-mono">{i + 1}</span>
                <span className="flex-1 text-sm text-gray-800 font-medium truncate">{ing.name}</span>
                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min((ing.total / grandTotal) * 100 * 3, 100)}%` }} />
                </div>
                <span className="text-xs font-mono font-semibold text-amber-700 w-20 text-left">{ing.total.toFixed(0)} ر.س</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Price volatility */}
      {volatile.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">تذبذب الأسعار خلال الفترة</span>
            <span className="text-[10px] text-gray-400">مواد تغيّر سعرها ≥ 5%</span>
          </div>
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50/50">
                <th className="text-right px-4 py-2 font-medium">المادة</th>
                <th className="text-center px-4 py-2 font-medium">أول سعر</th>
                <th className="text-center px-4 py-2 font-medium">آخر سعر</th>
                <th className="text-center px-4 py-2 font-medium">التغيّر</th>
              </tr>
            </thead>
            <tbody>
              {volatile.map(r => (
                <tr key={r.sku} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-900">{r.name}</span>
                    <span className="text-[10px] text-gray-400 mr-1">/ {r.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-500">{r.first.toFixed(4)}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-700 font-semibold">{r.last.toFixed(4)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${r.pct > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      {r.pct > 0 ? '+' : ''}{r.pct.toFixed(1)}%
                    </span>
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

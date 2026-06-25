'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { usePermissionsStore } from '@/stores/permissionsStore'
import { downloadSalesTemplate, parseSalesFile, validateSaleRows } from '@/lib/excel'
import { VAT_RATE } from '@/lib/calculations'
import { parseFoodicsFile } from '@/lib/parseFoodics'
import type { SaleRow, FoodicsCancellationRow, FoodicsModifierRow, BrandId } from '@/types'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useGlobalLoading } from '@/contexts/globalLoading'

type SourceType = 'excel' | 'foodics_sales' | 'foodics_cancel' | 'foodics_modifiers'

interface BatchSummary {
  import_batch: string; sale_date: string; item_count: number
  total_qty: number; total_revenue: number; source: string
  imported_at: string; exploded_at: string | null
}

const WASTE_TYPE_LABEL: Record<string, string> = { cancellation: 'إلغاء', return: 'مرتجع' }

interface Props {
  initialBatches: BatchSummary[]
  brand: BrandId
}

export default function SalesClient({ initialBatches, brand }: Props) {
  const router = useRouter()
  const { profile } = useUserStore()
  const { isSuperAdmin, hasPermission } = usePermissionsStore()
  const { startLoading, stopLoading } = useGlobalLoading()
  const canImport = isSuperAdmin || hasPermission('sales', 'import')
  const fileRef = useRef<HTMLInputElement>(null)

  const [batches, setBatches]               = useState<BatchSummary[]>(initialBatches)
  const [sourceType, setSourceType]         = useState<SourceType | null>(null)
  const [salesPreview, setSalesPreview]     = useState<SaleRow[]>([])
  const [cancelPreview, setCancelPreview]   = useState<FoodicsCancellationRow[]>([])
  const [modifierPreview, setModifierPreview] = useState<FoodicsModifierRow[]>([])
  const [modifierDateFrom, setModifierDateFrom] = useState<string>('')
  const [modifierDateTo, setModifierDateTo]     = useState<string>('')
  const [parseError, setParseError]         = useState<string | null>(null)
  const [importing, setImporting]           = useState(false)
  const [importMsg, setImportMsg]           = useState<{ ok: boolean; text: string } | null>(null)
  const [deletingBatch, setDeletingBatch]   = useState<string | null>(null)
  const [reversingBatch, setReversingBatch] = useState<string | null>(null)
  const [reverseMsg, setReverseMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [dlg, setDlg] = useState<{ msg: string; onOk: () => void } | null>(null)
  const [detectedDate, setDetectedDate]     = useState<string>('')
  const [lastImportBatch, setLastImportBatch]   = useState<string | null>(null)
  const [showExplodePanel, setShowExplodePanel] = useState(false)
  const [explodeCheckData, setExplodeCheckData] = useState<any>(null)
  const [checking, setChecking]                 = useState(false)
  const [exploding, setExploding]               = useState(false)
  const [explodeResult, setExplodeResult]       = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { setBatches(initialBatches) }, [initialBatches])

  function resetPreview() {
    setSourceType(null); setSalesPreview([]); setCancelPreview([])
    setModifierPreview([]); setModifierDateFrom(''); setModifierDateTo('')
    setParseError(null); setImportMsg(null); setDetectedDate('')
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    resetPreview()
    try {
      const result = await parseFoodicsFile(file)
      if (result.type === 'sales' && result.sales.length > 0) {
        setSourceType('foodics_sales'); setSalesPreview(result.sales); setDetectedDate(result.date)
      } else if (result.type === 'cancellations' && result.cancellations.length > 0) {
        setSourceType('foodics_cancel'); setCancelPreview(result.cancellations); setDetectedDate(result.date)
      } else if (result.type === 'modifiers' && result.modifiers.length > 0) {
        setSourceType('foodics_modifiers'); setModifierPreview(result.modifiers)
        setModifierDateFrom(result.dateFrom); setModifierDateTo(result.dateTo)
      } else {
        const rows = await parseSalesFile(file)
        if (rows.length === 0) { setParseError('لم يتم العثور على بيانات صالحة في الملف'); return }
        const { valid: vRows, errors: vErrs } = validateSaleRows(rows)
        if (vErrs.length) setParseError(`تحذير: ${vErrs.length} سطر بيانات غير صالحة — ${vErrs[0]}`)
        if (vRows.length === 0) { setParseError('جميع الأسطر تحتوي على بيانات غير صالحة'); return }
        setSourceType('excel'); setSalesPreview(vRows)
      }
    } catch (err: any) { setParseError(err.message) }
    e.target.value = ''
  }

  async function handleImportSales() {
    if (salesPreview.length === 0) return
    setImporting(true); setImportMsg(null)
    startLoading('جارٍ استيراد المبيعات...')
    try {
      const supabase = createClient()
      const batchId  = crypto.randomUUID()
      const rows = salesPreview.map(r => ({
        brand_id: brand as string, sale_date: r.sale_date, product_sku: r.product_sku,
        product_name: r.product_name, qty_sold: r.qty_sold, revenue: r.revenue,
        branch_name: r.branch_name ?? null, branch_ref: r.branch_ref ?? null,
        tax_amount: r.tax_amount ?? 0, discount_amount: r.discount_amount ?? 0,
        return_amount: r.return_amount ?? 0, return_qty: r.return_qty ?? 0,
        cancel_amount: r.cancel_amount ?? 0, cancel_qty: r.cancel_qty ?? 0,
        cost_pos: r.cost_pos ?? 0, source: r.source ?? 'excel',
        import_batch: batchId, imported_by: profile?.id ?? null,
      }))
      const { error } = await (supabase.from('daily_sales') as any).insert(rows)
      if (error) throw error
      setLastImportBatch(batchId); setExplodeCheckData(null); setExplodeResult(null)
      setImportMsg({ ok: true, text: `تم استيراد ${rows.length} سجل بنجاح — اضغط "احتساب التكلفة" لخصم المخزون` })
      setSalesPreview([]); setSourceType(null)
      router.refresh()
    } catch (err: any) {
      setImportMsg({ ok: false, text: `خطأ: ${err.message}` })
    } finally { setImporting(false); stopLoading() }
  }

  async function handleImportCancellations() {
    if (cancelPreview.length === 0) return
    setImporting(true); setImportMsg(null)
    try {
      const supabase = createClient()
      const batchId  = crypto.randomUUID()
      const rows = cancelPreview.map(r => ({
        brand_id: brand as string, branch_name: r.branch_name || null, branch_ref: r.branch_ref || null,
        log_date: detectedDate || new Date().toISOString().slice(0, 10),
        product_name: r.product_name, product_sku: null, qty: r.qty, value: r.value,
        waste_type: r.waste_type, reason: r.reason || null, order_ref: r.order_ref || null,
        was_wasted: r.was_wasted, import_batch: batchId, created_by: profile?.id ?? null,
      }))
      const { error } = await (supabase.from('waste_log') as any).insert(rows)
      if (error) throw error
      setImportMsg({ ok: true, text: `تم استيراد ${rows.length} سجل إلغاء/مرتجع بنجاح` })
      setCancelPreview([]); setSourceType(null)
    } catch (err: any) {
      setImportMsg({ ok: false, text: `خطأ: ${err.message}` })
    } finally { setImporting(false) }
  }

  async function handleImportModifiers() {
    if (modifierPreview.length === 0) return
    if (!modifierDateFrom || !modifierDateTo) {
      setImportMsg({ ok: false, text: 'يرجى تحديد الفترة الزمنية للاستيراد' }); return
    }
    setImporting(true); setImportMsg(null)
    startLoading('جارٍ استيراد مبيعات الإضافات...')
    try {
      const supabase = createClient()
      // Period close guard
      const { data: brandRow } = await (supabase.from('brands') as any)
        .select('closed_up_to').eq('id', brand).single()
      if (brandRow?.closed_up_to && modifierDateFrom <= brandRow.closed_up_to) {
        setImportMsg({ ok: false, text: `الفترة مغلقة حتى ${brandRow.closed_up_to} — لا يمكن استيراد بيانات تبدأ من ${modifierDateFrom}` })
        return
      }
      const batchId = crypto.randomUUID()
      const rows = modifierPreview.map(r => ({
        brand_id: brand as string,
        date_from: modifierDateFrom, date_to: modifierDateTo,
        option_sku: r.option_sku, option_name: r.option_name,
        product_sku: r.product_sku, product_name: r.product_name,
        qty_sold: r.qty_sold, revenue: r.revenue,
        import_batch: batchId, imported_by: profile?.id ?? null,
      }))
      const { error } = await (supabase.from('modifier_sales') as any).insert(rows)
      if (error) throw error
      setImportMsg({ ok: true, text: `تم استيراد ${rows.length} سجل إضافات بنجاح — ستُحتسب تكاليفها تلقائياً عند احتساب التكلفة` })
      setModifierPreview([]); setSourceType(null)
    } catch (err: any) {
      setImportMsg({ ok: false, text: `خطأ: ${err.message}` })
    } finally { setImporting(false); stopLoading() }
  }

  function handleDeleteBatch(batchId: string) {
    setDlg({ msg: 'حذف هذه الدفعة من سجل المبيعات؟', onOk: async () => {
      setDeletingBatch(batchId)
      const supabase = createClient()
      await (supabase.from('daily_sales') as any).delete().eq('import_batch', batchId)
      setDeletingBatch(null)
      router.refresh()
    }})
  }

  function handleReverseExplode(batchId: string) {
    setDlg({ msg: 'عكس الانفجار سيُرجع كميات المواد للمخزون ويُعيد الدفعة لحالة "غير محتسبة". هل أنت متأكد؟', onOk: async () => {
      setReversingBatch(batchId)
      setReverseMsg(null)
      const res = await fetch('/api/sales/reverse-explode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_id: brand, import_batch: batchId }),
      })
      const data = await res.json()
      setReversingBatch(null)
      if (!res.ok) {
        setReverseMsg({ ok: false, text: data.error ?? 'خطأ غير متوقع' })
      } else {
        setReverseMsg({ ok: true, text: `تم العكس — أُرجعت ${data.movements_del ?? 0} حركة خصم للمخزون ✓` })
        router.refresh()
      }
    }})
  }

  async function handleExplodeCheck() {
    if (!lastImportBatch) return
    setChecking(true); setExplodeCheckData(null); setExplodeResult(null); setShowExplodePanel(true)
    const res = await fetch('/api/sales/explode-check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_id: brand, import_batch: lastImportBatch }),
    })
    const data = await res.json()
    setExplodeCheckData(res.ok ? data : null)
    if (!res.ok) setExplodeResult({ ok: false, text: data.error })
    setChecking(false)
  }

  async function handleExplodeExecute() {
    if (!lastImportBatch) return
    setExploding(true); setExplodeResult(null)
    startLoading('جارٍ احتساب التكلفة وخصم المخزون...')
    const res = await fetch('/api/sales/explode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_id: brand, import_batch: lastImportBatch, auto_produce_batches: true, performed_by: profile?.id ?? null }),
    })
    const data = await res.json()
    if (!res.ok) { setExplodeResult({ ok: false, text: data.error }); setExploding(false); stopLoading(); return }
    const parts = [`خُصم ${data.deducted ?? 0} صنف من المخزون`]
    if (data.produced_batches?.length) parts.push(`أُنتج ${data.produced_batches.length} باتش تلقائياً`)
    if (data.skipped) parts.push(`تخطّى ${data.skipped} منتج بلا وصفة`)
    setExplodeResult({ ok: true, text: parts.join(' · ') + ' ✓' })
    setLastImportBatch(null); setExploding(false)
    stopLoading()
    router.refresh()
  }

  const totalRevenue = salesPreview.reduce((s, r) => s + r.revenue, 0)
  const totalQty     = salesPreview.reduce((s, r) => s + r.qty_sold, 0)
  const totalCancel  = cancelPreview.reduce((s, r) => s + r.value, 0)
  const branches     = [...new Set(salesPreview.map(r => r.branch_name).filter(Boolean))]
  const byBranch = salesPreview.reduce((acc, r) => {
    const key = r.branch_name || 'غير محدد'
    if (!acc[key]) acc[key] = { qty: 0, revenue: 0, rows: 0 }
    acc[key].qty += r.qty_sold; acc[key].revenue += r.revenue; acc[key].rows++
    return acc
  }, {} as Record<string, { qty: number; revenue: number; rows: number }>)

  const brandColor = brand === 'ti' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'
  const brandLabel = brand === 'ti' ? 'Three In 🍔' : 'باب البلد 🫕'

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">استيراد المبيعات</h1>
          <p className="text-gray-500 text-sm mt-0.5">يدعم تقارير Foodics (مبيعات + إلغاءات) وملفات Excel العامة</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border ${brandColor}`}>
            <span>البراند الحالي:</span><span>{brandLabel}</span>
          </div>
          <button onClick={() => downloadSalesTemplate().catch(console.error)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
            ⬇ قالب Excel
          </button>
        </div>
      </div>

      <div onClick={() => canImport && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors bg-white ${canImport ? 'border-gray-300 hover:border-green-400 cursor-pointer' : 'border-gray-200 opacity-50 cursor-not-allowed'}`}>
        <div className="text-4xl mb-3">📊</div>
        <p className="text-gray-600 font-medium">اضغط لاختيار ملف</p>
        <p className="text-gray-400 text-sm mt-1">Foodics Export (.xlsx) أو Excel عام</p>
        <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">📋 مبيعات Foodics</span>
          <span className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full">🗑 إلغاءات Foodics</span>
          <span className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded-full">➕ إضافات Foodics</span>
          <span className="text-xs bg-gray-50 text-gray-500 px-2 py-1 rounded-full">📄 Excel عام</span>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      </div>

      {parseError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{parseError}</div>}

      {/* Sales Preview */}
      {sourceType === 'foodics_sales' && salesPreview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-blue-50">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">Foodics — مبيعات</span>
              <span className="text-sm text-gray-600">تاريخ التقرير: <span className="font-mono font-semibold">{detectedDate}</span></span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-400">إجمالي الإيراد (شامل VAT)</div>
                <div className="font-bold text-blue-700 font-mono">{totalRevenue.toFixed(2)} ر.س</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-400">قبل VAT</div>
                <div className="font-bold text-green-700 font-mono">{(totalRevenue / VAT_RATE).toFixed(2)} ر.س</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-400">إجمالي الوجبات</div>
                <div className="font-bold text-gray-800 font-mono">{totalQty}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-400">الفروع</div>
                <div className="font-bold text-gray-800 text-sm">{branches.length > 0 ? branches.join(', ') : '—'}</div>
              </div>
            </div>
          </div>
          {Object.keys(byBranch).length > 1 && (
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <div className="text-xs font-medium text-gray-500 mb-2">توزيع حسب الفرع</div>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(byBranch).map(([branch, s]) => (
                  <div key={branch} className="flex items-center gap-2 text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="font-medium text-gray-700">{branch}</span>
                    <span className="text-gray-400">|</span>
                    <span className="font-mono text-green-700">{s.revenue.toFixed(0)} ر.س</span>
                    <span className="text-gray-400">|</span>
                    <span className="font-mono text-gray-600">{s.qty} وجبة</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="overflow-x-auto max-h-80">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-3 py-2.5 font-medium">المنتج</th>
                  <th className="text-right px-3 py-2.5 font-medium">الفرع</th>
                  <th className="text-left px-3 py-2.5 font-medium">الكمية</th>
                  <th className="text-left px-3 py-2.5 font-medium">الإيراد</th>
                  <th className="text-left px-3 py-2.5 font-medium">الضريبة</th>
                  <th className="text-left px-3 py-2.5 font-medium">إلغاء</th>
                </tr>
              </thead>
              <tbody>
                {salesPreview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="text-gray-800 font-medium text-xs">{r.product_name}</div>
                      <div className="text-gray-400 font-mono text-xs">{r.product_sku}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.branch_ref}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs text-gray-700">{r.qty_sold}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs font-semibold text-green-700">{r.revenue.toFixed(2)}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs text-gray-400">{(r.tax_amount ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs text-red-400">
                      {(r.cancel_qty ?? 0) > 0 ? `${r.cancel_qty} / ${(r.cancel_amount ?? 0).toFixed(0)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
            {importMsg && <span className={`text-sm ${importMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{importMsg.text}</span>}
            <div className="flex gap-2 ms-auto">
              <button onClick={resetPreview} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
              <button onClick={handleImportSales} disabled={importing}
                className="text-sm px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
                {importing ? 'جارٍ الاستيراد...' : `استيراد ${salesPreview.length} سجل`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellations Preview */}
      {sourceType === 'foodics_cancel' && cancelPreview.length > 0 && (
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-red-200 bg-red-50">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-semibold bg-red-100 text-red-700 px-2.5 py-1 rounded-full">Foodics — إلغاءات ومرتجعات</span>
              <span className="text-sm text-gray-600">التاريخ: <span className="font-mono font-semibold">{detectedDate}</span></span>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-gray-600">{cancelPreview.length} سجل</span>
              <span className="font-mono font-semibold text-red-700">{totalCancel.toFixed(2)} ر.س</span>
              <span className="text-orange-600">{cancelPreview.filter(r => r.was_wasted).length} تم إهدارها</span>
            </div>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-3 py-2.5 font-medium">المنتج</th>
                  <th className="text-center px-3 py-2.5 font-medium">النوع</th>
                  <th className="text-left px-3 py-2.5 font-medium">الكمية</th>
                  <th className="text-left px-3 py-2.5 font-medium">القيمة</th>
                  <th className="text-right px-3 py-2.5 font-medium">السبب</th>
                  <th className="text-center px-3 py-2.5 font-medium">هدر</th>
                </tr>
              </thead>
              <tbody>
                {cancelPreview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800 text-xs font-medium">{r.product_name}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.waste_type === 'return' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                        {WASTE_TYPE_LABEL[r.waste_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end font-mono text-xs">{r.qty}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs text-red-600">{r.value.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">{r.reason}</td>
                    <td className="px-3 py-2 text-center text-xs">
                      {r.was_wasted ? <span className="text-orange-600">نعم</span> : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
            {importMsg && <span className={`text-sm ${importMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{importMsg.text}</span>}
            <div className="flex gap-2 ms-auto">
              <button onClick={resetPreview} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
              <button onClick={handleImportCancellations} disabled={importing}
                className="text-sm px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium disabled:opacity-50">
                {importing ? 'جارٍ الاستيراد...' : `استيراد ${cancelPreview.length} سجل`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modifiers Preview */}
      {sourceType === 'foodics_modifiers' && modifierPreview.length > 0 && (
        <div className="bg-white border border-purple-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-purple-200 bg-purple-50">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">Foodics — إضافات الأصناف</span>
              <span className="text-sm text-gray-600">{modifierPreview.length} سجل</span>
              <span className="font-mono text-sm text-purple-700 font-semibold">
                {modifierPreview.reduce((s, r) => s + r.qty_sold, 0).toFixed(0)} إضافة
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-500 whitespace-nowrap">من:</label>
                <input type="date" value={modifierDateFrom} onChange={e => setModifierDateFrom(e.target.value)}
                  className="border border-purple-200 rounded-lg px-2 py-1 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-500 whitespace-nowrap">إلى:</label>
                <input type="date" value={modifierDateTo} onChange={e => setModifierDateTo(e.target.value)}
                  className="border border-purple-200 rounded-lg px-2 py-1 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-3 py-2.5 font-medium">خيار الإضافة</th>
                  <th className="text-right px-3 py-2.5 font-medium">كود الخيار</th>
                  <th className="text-right px-3 py-2.5 font-medium">المنتج</th>
                  <th className="text-left px-3 py-2.5 font-medium">الكمية</th>
                  <th className="text-left px-3 py-2.5 font-medium">الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {modifierPreview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800 text-xs font-medium">{r.option_name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">{r.option_sku || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.product_name}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs text-gray-700">{r.qty_sold}</td>
                    <td className="px-3 py-2 text-end font-mono text-xs text-purple-700 font-semibold">{r.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
            {importMsg && <span className={`text-sm ${importMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{importMsg.text}</span>}
            <div className="flex gap-2 ms-auto">
              <button onClick={resetPreview} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
              <button onClick={handleImportModifiers} disabled={importing}
                className="text-sm px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium disabled:opacity-50">
                {importing ? 'جارٍ الاستيراد...' : `استيراد ${modifierPreview.length} سجل`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Preview */}
      {sourceType === 'excel' && salesPreview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-4 flex-wrap bg-gray-50">
            <span className="font-semibold text-gray-900">معاينة — {salesPreview.length} سجل</span>
            <span className="text-sm text-gray-500">إيراد: <span className="font-mono font-semibold text-gray-800">{totalRevenue.toFixed(2)} ر.س</span></span>
            <span className="text-sm text-gray-500">وجبات: <span className="font-mono font-semibold">{totalQty}</span></span>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-4 py-2.5 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-2.5 font-medium">المنتج</th>
                  <th className="text-right px-4 py-2.5 font-medium">SKU</th>
                  <th className="text-left px-4 py-2.5 font-medium">الكمية</th>
                  <th className="text-left px-4 py-2.5 font-medium">الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {salesPreview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.sale_date}</td>
                    <td className="px-4 py-2 text-gray-800 font-medium text-xs">{r.product_name}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">{r.product_sku || '—'}</td>
                    <td className="px-4 py-2 text-end font-mono text-xs text-gray-700">{r.qty_sold}</td>
                    <td className="px-4 py-2 text-end font-mono text-xs font-semibold text-green-700">{r.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={resetPreview} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
            <button onClick={handleImportSales} disabled={importing}
              className="text-sm px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium disabled:opacity-50">
              {importing ? 'جارٍ الاستيراد...' : `استيراد ${salesPreview.length} سجل`}
            </button>
          </div>
        </div>
      )}

      {importMsg && !sourceType && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${importMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {importMsg.text}
        </div>
      )}

      {reverseMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${reverseMsg.ok ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {reverseMsg.text}
        </div>
      )}

      {/* Explode Panel */}
      {lastImportBatch && !sourceType && (
        <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <span className="font-semibold text-blue-900 text-sm">احتساب التكلفة وخصم المخزون</span>
              <p className="text-xs text-blue-600 mt-0.5">تحقق من الوصفات والباتشات والمواد قبل الخصم</p>
            </div>
            <button onClick={handleExplodeCheck} disabled={checking}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors">
              {checking ? 'جارٍ التحليل...' : '🔍 تحليل وفحص'}
            </button>
          </div>
          {explodeResult && (
            <div className={`px-5 py-3 text-sm border-b ${explodeResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
              {explodeResult.text}
            </div>
          )}
          {showExplodePanel && explodeCheckData && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">منتجات جاهزة</div>
                  <div className="text-xl font-bold text-green-700">{explodeCheckData.ready_skus}</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${explodeCheckData.missing_recipes?.length ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <div className="text-xs text-gray-500">بلا وصفة</div>
                  <div className={`text-xl font-bold ${explodeCheckData.missing_recipes?.length ? 'text-red-600' : 'text-gray-400'}`}>
                    {explodeCheckData.missing_recipes?.length ?? 0}
                  </div>
                </div>
                <div className={`rounded-lg p-3 text-center ${explodeCheckData.batches_to_produce?.some((b: any) => b.needs_production) ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <div className="text-xs text-gray-500">باتشات تحتاج إنتاج</div>
                  <div className={`text-xl font-bold ${explodeCheckData.batches_to_produce?.some((b: any) => b.needs_production) ? 'text-amber-600' : 'text-gray-400'}`}>
                    {explodeCheckData.batches_to_produce?.filter((b: any) => b.needs_production).length ?? 0}
                  </div>
                </div>
                <div className={`rounded-lg p-3 text-center ${explodeCheckData.low_ingredients?.length ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <div className="text-xs text-gray-500">مواد خام ناقصة</div>
                  <div className={`text-xl font-bold ${explodeCheckData.low_ingredients?.length ? 'text-amber-600' : 'text-gray-400'}`}>
                    {explodeCheckData.low_ingredients?.length ?? 0}
                  </div>
                </div>
              </div>
              {explodeCheckData.missing_recipes?.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">❌ منتجات بلا وصفة نشطة (ستُتخطى):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {explodeCheckData.missing_recipes.map((m: any) => (
                      <span key={m.sku} className="text-xs bg-white border border-red-200 text-red-700 px-2 py-0.5 rounded font-mono">{m.name}</span>
                    ))}
                  </div>
                </div>
              )}
              {explodeCheckData.batches_to_produce?.some((b: any) => b.needs_production) && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2">🔄 باتشات تحتاج إنتاج (سيُنتجها النظام تلقائياً):</p>
                  <table suppressHydrationWarning className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-amber-100">
                        <th className="text-right py-1">الباتش</th><th className="text-center py-1">المطلوب</th>
                        <th className="text-center py-1">المخزون</th><th className="text-center py-1">العجز</th><th className="text-center py-1">وصفة؟</th>
                      </tr>
                    </thead>
                    <tbody>
                      {explodeCheckData.batches_to_produce.filter((b: any) => b.needs_production).map((b: any) => (
                        <tr key={b.sku} className="border-b border-amber-50 last:border-0">
                          <td className="py-1 font-medium text-gray-800">{b.name}</td>
                          <td className="py-1 text-center font-mono">{b.needed}</td>
                          <td className="py-1 text-center font-mono">{b.in_stock}</td>
                          <td className="py-1 text-center font-mono text-red-600">-{b.deficit}</td>
                          <td className="py-1 text-center">{b.has_recipe ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗ لا</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {explodeCheckData.low_ingredients?.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1.5">⚠ مواد خام كمياتها أقل من المطلوب:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {explodeCheckData.low_ingredients.map((ing: any) => (
                      <span key={ing.sku} className="text-xs bg-white border border-amber-200 text-amber-800 px-2 py-0.5 rounded">
                        {ing.name} (عجز: {ing.deficit} {ing.unit})
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {explodeCheckData.blocking && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">🚫 {explodeCheckData.blocking_reason}</div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={handleExplodeExecute} disabled={exploding || !explodeCheckData.can_proceed}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
                  {exploding ? 'جارٍ الاحتساب...' : '✓ تأكيد الاحتساب والخصم'}
                </button>
                <button onClick={() => { setShowExplodePanel(false); setExplodeCheckData(null) }}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">إغلاق</button>
                {explodeCheckData.low_ingredients?.length > 0 && (
                  <span className="text-xs text-amber-600">سيُنفَّذ الخصم حتى للمواد الناقصة</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
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
                <th className="text-center px-4 py-2.5 font-medium">المصدر</th>
                <th className="text-center px-4 py-2.5 font-medium">السجلات</th>
                <th className="text-left px-4 py-2.5 font-medium">الوجبات</th>
                <th className="text-left px-4 py-2.5 font-medium">الإيراد</th>
                <th className="text-center px-4 py-2.5 font-medium">المخزون</th>
                <th className="text-left px-4 py-2.5 font-medium">وقت الاستيراد</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.import_batch} className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
                  onClick={() => router.push(`/${brand}/sales/${b.import_batch}`)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.sale_date}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.source === 'foodics' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {b.source === 'foodics' ? 'Foodics' : 'Excel'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{b.item_count}</td>
                  <td className="px-4 py-3 text-end font-mono text-gray-700">{b.total_qty.toFixed(0)}</td>
                  <td className="px-4 py-3 text-end font-mono font-semibold text-gray-800">{b.total_revenue.toFixed(2)} ر.س</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    {b.exploded_at ? (
                      <div className="flex items-center gap-2 justify-center">
                        <span className="text-xs text-green-600 font-medium">✓ محتسب</span>
                        {isSuperAdmin && (
                          <button
                            onClick={() => handleReverseExplode(b.import_batch)}
                            disabled={reversingBatch === b.import_batch}
                            className="text-xs px-2 py-0.5 bg-orange-50 border border-orange-300 text-orange-700 rounded hover:bg-orange-100 disabled:opacity-40 whitespace-nowrap">
                            {reversingBatch === b.import_batch ? '...' : '↩ عكس'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => { setLastImportBatch(b.import_batch); setShowExplodePanel(false); setExplodeCheckData(null); setExplodeResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                        className="text-xs px-2 py-1 bg-amber-50 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 font-medium whitespace-nowrap">
                        ⚠ احتسب المخزون
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end text-xs text-gray-400 font-mono">{new Date(b.imported_at).toLocaleString('en-US')}</td>
                  <td className="px-4 py-3 text-end" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleDeleteBatch(b.import_batch)} disabled={deletingBatch === b.import_batch}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {dlg && <ConfirmDialog message={dlg.msg} onConfirm={() => { dlg.onOk(); setDlg(null) }} onCancel={() => setDlg(null)} />}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { usePermissionsStore } from '@/stores/permissionsStore'
import { downloadSalesTemplate, parseSalesFile } from '@/lib/excel'
import { parseFoodicsFile } from '@/lib/parseFoodics'
import type { SaleRow, FoodicsCancellationRow } from '@/types'

type SourceType = 'excel' | 'foodics_sales' | 'foodics_cancel'

interface BatchSummary {
  import_batch: string
  sale_date: string
  item_count: number
  total_qty: number
  total_revenue: number
  source: string
  imported_at: string
}

const WASTE_TYPE_LABEL: Record<string, string> = {
  cancellation: 'إلغاء',
  return: 'مرتجع',
}

export default function SalesPage() {
  const { brand } = useBrandStore()
  const { profile } = useUserStore()
  const { isSuperAdmin, hasPermission } = usePermissionsStore()
  const canImport = isSuperAdmin || hasPermission('sales', 'import')
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [sourceType, setSourceType]         = useState<SourceType | null>(null)
  const [salesPreview, setSalesPreview]     = useState<SaleRow[]>([])
  const [cancelPreview, setCancelPreview]   = useState<FoodicsCancellationRow[]>([])
  const [parseError, setParseError]         = useState<string | null>(null)
  const [importing, setImporting]           = useState(false)
  const [importMsg, setImportMsg]           = useState<{ ok: boolean; text: string } | null>(null)
  const [batches, setBatches]               = useState<BatchSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deletingBatch, setDeletingBatch]   = useState<string | null>(null)
  const [detectedDate, setDetectedDate]     = useState<string>('')

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    const supabase = createClient()
    const { data } = await (supabase.from('daily_sales') as any)
      .select('import_batch, sale_date, qty_sold, revenue, source, created_at')
      .eq('brand_id', brand)
      .order('created_at', { ascending: false })

    if (data) {
      const map = new Map<string, BatchSummary>()
      for (const row of data as any[]) {
        const b = row.import_batch
        if (!map.has(b)) map.set(b, { import_batch: b, sale_date: row.sale_date, item_count: 0, total_qty: 0, total_revenue: 0, source: row.source ?? 'excel', imported_at: row.created_at })
        const s = map.get(b)!
        s.item_count++
        s.total_qty     += row.qty_sold
        s.total_revenue += row.revenue
      }
      setBatches([...map.values()])
    }
    setLoadingHistory(false)
  }, [brand])

  useEffect(() => { loadHistory() }, [loadHistory])

  function resetPreview() {
    setSourceType(null)
    setSalesPreview([])
    setCancelPreview([])
    setParseError(null)
    setImportMsg(null)
    setDetectedDate('')
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    resetPreview()
    try {
      // Try Foodics first (auto-detect by content)
      const result = await parseFoodicsFile(file)
      if (result.type === 'sales' && result.sales.length > 0) {
        setSourceType('foodics_sales')
        setSalesPreview(result.sales)
        setDetectedDate(result.date)
      } else if (result.type === 'cancellations' && result.cancellations.length > 0) {
        setSourceType('foodics_cancel')
        setCancelPreview(result.cancellations)
        setDetectedDate(result.date)
      } else {
        // Fallback to standard Excel parser
        const rows = await parseSalesFile(file)
        if (rows.length === 0) { setParseError('لم يتم العثور على بيانات صالحة في الملف'); return }
        setSourceType('excel')
        setSalesPreview(rows)
      }
    } catch (err: any) {
      setParseError(err.message)
    }
    e.target.value = ''
  }

  async function handleImportSales() {
    if (salesPreview.length === 0) return
    setImporting(true)
    setImportMsg(null)
    try {
      const supabase = createClient()
      const batchId  = crypto.randomUUID()
      const rows = salesPreview.map(r => ({
        brand_id:        brand as string,
        sale_date:       r.sale_date,
        product_sku:     r.product_sku,
        product_name:    r.product_name,
        qty_sold:        r.qty_sold,
        revenue:         r.revenue,
        branch_name:     r.branch_name ?? null,
        branch_ref:      r.branch_ref ?? null,
        tax_amount:      r.tax_amount ?? 0,
        discount_amount: r.discount_amount ?? 0,
        return_amount:   r.return_amount ?? 0,
        return_qty:      r.return_qty ?? 0,
        cancel_amount:   r.cancel_amount ?? 0,
        cancel_qty:      r.cancel_qty ?? 0,
        cost_pos:        r.cost_pos ?? 0,
        source:          r.source ?? 'excel',
        import_batch:    batchId,
        imported_by:     profile?.id ?? null,
      }))
      const { error } = await (supabase.from('daily_sales') as any).insert(rows)
      if (error) throw error
      setImportMsg({ ok: true, text: `تم استيراد ${rows.length} سجل بنجاح` })
      setSalesPreview([])
      setSourceType(null)
      await loadHistory()
    } catch (err: any) {
      setImportMsg({ ok: false, text: `خطأ: ${err.message}` })
    } finally {
      setImporting(false)
    }
  }

  async function handleImportCancellations() {
    if (cancelPreview.length === 0) return
    setImporting(true)
    setImportMsg(null)
    try {
      const supabase = createClient()
      const batchId  = crypto.randomUUID()
      const rows = cancelPreview.map(r => ({
        brand_id:     brand as string,
        branch_name:  r.branch_name || null,
        branch_ref:   r.branch_ref || null,
        log_date:     detectedDate || new Date().toISOString().slice(0, 10),
        product_name: r.product_name,
        product_sku:  null,
        qty:          r.qty,
        value:        r.value,
        waste_type:   r.waste_type,
        reason:       r.reason || null,
        order_ref:    r.order_ref || null,
        was_wasted:   r.was_wasted,
        import_batch: batchId,
        created_by:   profile?.id ?? null,
      }))
      const { error } = await (supabase.from('waste_log') as any).insert(rows)
      if (error) throw error
      setImportMsg({ ok: true, text: `تم استيراد ${rows.length} سجل إلغاء/مرتجع بنجاح` })
      setCancelPreview([])
      setSourceType(null)
    } catch (err: any) {
      setImportMsg({ ok: false, text: `خطأ: ${err.message}` })
    } finally {
      setImporting(false)
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm('حذف هذه الدفعة من سجل المبيعات؟')) return
    setDeletingBatch(batchId)
    const supabase = createClient()
    await (supabase.from('daily_sales') as any).delete().eq('import_batch', batchId)
    setDeletingBatch(null)
    await loadHistory()
  }

  const totalRevenue = salesPreview.reduce((s, r) => s + r.revenue, 0)
  const totalQty     = salesPreview.reduce((s, r) => s + r.qty_sold, 0)
  const totalCancel  = cancelPreview.reduce((s, r) => s + r.value, 0)
  const branches     = [...new Set(salesPreview.map(r => r.branch_name).filter(Boolean))]

  // Group sales by branch for preview
  const byBranch = salesPreview.reduce((acc, r) => {
    const key = r.branch_name || 'غير محدد'
    if (!acc[key]) acc[key] = { qty: 0, revenue: 0, rows: 0 }
    acc[key].qty     += r.qty_sold
    acc[key].revenue += r.revenue
    acc[key].rows++
    return acc
  }, {} as Record<string, { qty: number; revenue: number; rows: number }>)

  const brandLabel = brand === 'ti' ? 'Three In 🍔' : 'باب البلد 🫕'
  const brandColor = brand === 'ti' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">استيراد المبيعات</h1>
          <p className="text-gray-500 text-sm mt-0.5">يدعم تقارير Foodics (مبيعات + إلغاءات) وملفات Excel العامة</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Brand warning — always visible */}
          <div className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border ${brandColor}`}>
            <span>البراند الحالي:</span>
            <span>{brandLabel}</span>
          </div>
          <button
            onClick={() => downloadSalesTemplate().catch(console.error)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
          >
            ⬇ قالب Excel
          </button>
        </div>
      </div>

      {/* Upload zone */}
      <div
        onClick={() => canImport && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors bg-white ${canImport ? 'border-gray-300 hover:border-green-400 cursor-pointer' : 'border-gray-200 opacity-50 cursor-not-allowed'}`}
      >
        <div className="text-4xl mb-3">📊</div>
        <p className="text-gray-600 font-medium">اضغط لاختيار ملف</p>
        <p className="text-gray-400 text-sm mt-1">Foodics Export (.xlsx) أو Excel عام</p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">📋 مبيعات Foodics</span>
          <span className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full">🗑 إلغاءات Foodics</span>
          <span className="text-xs bg-gray-50 text-gray-500 px-2 py-1 rounded-full">📄 Excel عام</span>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{parseError}</div>
      )}

      {/* ── Sales Preview ─────────────────────────────────────── */}
      {sourceType === 'foodics_sales' && salesPreview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 bg-blue-50">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">Foodics — مبيعات</span>
              <span className="text-sm text-gray-600">تاريخ التقرير: <span className="font-mono font-semibold">{detectedDate}</span></span>
            </div>
            {/* Branch summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-400">إجمالي الإيراد (شامل VAT)</div>
                <div className="font-bold text-blue-700 font-mono">{totalRevenue.toFixed(2)} ر.س</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-400">قبل VAT</div>
                <div className="font-bold text-green-700 font-mono">{(totalRevenue / 1.15).toFixed(2)} ر.س</div>
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

          {/* Branch breakdown */}
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

          {/* Table */}
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-sm">
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
                    <td className="px-3 py-2 text-left font-mono text-xs text-gray-700">{r.qty_sold}</td>
                    <td className="px-3 py-2 text-left font-mono text-xs font-semibold text-green-700">{r.revenue.toFixed(2)}</td>
                    <td className="px-3 py-2 text-left font-mono text-xs text-gray-400">{(r.tax_amount ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-left font-mono text-xs text-red-400">
                      {(r.cancel_qty ?? 0) > 0 ? `${r.cancel_qty} / ${(r.cancel_amount ?? 0).toFixed(0)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
            {importMsg && <span className={`text-sm ${importMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{importMsg.text}</span>}
            <div className="flex gap-2 mr-auto">
              <button onClick={resetPreview} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
              <button onClick={handleImportSales} disabled={importing}
                className="text-sm px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
                {importing ? 'جارٍ الاستيراد...' : `استيراد ${salesPreview.length} سجل`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancellations Preview ─────────────────────────────── */}
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
            <table className="w-full text-sm">
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
                    <td className="px-3 py-2 text-left font-mono text-xs">{r.qty}</td>
                    <td className="px-3 py-2 text-left font-mono text-xs text-red-600">{r.value.toFixed(2)}</td>
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
            <div className="flex gap-2 mr-auto">
              <button onClick={resetPreview} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
              <button onClick={handleImportCancellations} disabled={importing}
                className="text-sm px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
                {importing ? 'جارٍ الاستيراد...' : `استيراد ${cancelPreview.length} سجل`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Excel Preview (standard) ──────────────────────────── */}
      {sourceType === 'excel' && salesPreview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-4 flex-wrap bg-gray-50">
            <span className="font-semibold text-gray-900">معاينة — {salesPreview.length} سجل</span>
            <span className="text-sm text-gray-500">إيراد: <span className="font-mono font-semibold text-gray-800">{totalRevenue.toFixed(2)} ر.س</span></span>
            <span className="text-sm text-gray-500">وجبات: <span className="font-mono font-semibold">{totalQty}</span></span>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-sm">
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
                    <td className="px-4 py-2 text-left font-mono text-xs text-gray-700">{r.qty_sold}</td>
                    <td className="px-4 py-2 text-left font-mono text-xs font-semibold text-green-700">{r.revenue.toFixed(2)}</td>
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

      {/* History */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <span className="font-semibold text-gray-900">سجل الاستيراد</span>
          <button onClick={loadHistory} className="text-xs text-gray-500 hover:text-gray-700">تحديث</button>
        </div>
        {loadingHistory ? (
          <div className="p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">لا توجد عمليات استيراد سابقة</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <th className="text-right px-4 py-2.5 font-medium">التاريخ</th>
                <th className="text-center px-4 py-2.5 font-medium">المصدر</th>
                <th className="text-center px-4 py-2.5 font-medium">السجلات</th>
                <th className="text-left px-4 py-2.5 font-medium">الوجبات</th>
                <th className="text-left px-4 py-2.5 font-medium">الإيراد</th>
                <th className="text-left px-4 py-2.5 font-medium">وقت الاستيراد</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.import_batch}
                  className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
                  onClick={() => router.push(`/sales/${b.import_batch}`)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.sale_date}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.source === 'foodics' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {b.source === 'foodics' ? 'Foodics' : 'Excel'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{b.item_count}</td>
                  <td className="px-4 py-3 text-left font-mono text-gray-700">{b.total_qty.toFixed(0)}</td>
                  <td className="px-4 py-3 text-left font-mono font-semibold text-gray-800">{b.total_revenue.toFixed(2)} ر.س</td>
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
    </div>
  )
}

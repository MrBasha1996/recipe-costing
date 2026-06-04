'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { downloadSalesTemplate, parseSalesFile } from '@/lib/excel'
import type { SaleRow } from '@/types'

interface BatchSummary {
  import_batch: string
  sale_date: string
  item_count: number
  total_qty: number
  total_revenue: number
  imported_at: string
}

export default function SalesPage() {
  const { brand } = useBrandStore()
  const { profile } = useUserStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<SaleRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    const supabase = createClient()
    const { data } = await (supabase.from('daily_sales') as any)
      .select('import_batch, sale_date, qty_sold, revenue, created_at')
      .eq('brand_id', brand)
      .order('created_at', { ascending: false })

    if (data) {
      const map = new Map<string, BatchSummary>()
      for (const row of data as any[]) {
        const b = row.import_batch
        if (!map.has(b)) {
          map.set(b, { import_batch: b, sale_date: row.sale_date, item_count: 0, total_qty: 0, total_revenue: 0, imported_at: row.created_at })
        }
        const s = map.get(b)!
        s.item_count++
        s.total_qty += row.qty_sold
        s.total_revenue += row.revenue
      }
      setBatches([...map.values()])
    }
    setLoadingHistory(false)
  }, [brand])

  useEffect(() => { loadHistory() }, [loadHistory])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    setImportMsg(null)
    try {
      const rows = await parseSalesFile(file)
      if (rows.length === 0) { setParseError('لم يتم العثور على بيانات صالحة في الملف'); return }
      setPreview(rows)
    } catch (err: any) {
      setParseError(err.message)
    }
    e.target.value = ''
  }

  async function handleImport() {
    if (preview.length === 0) return
    setImporting(true)
    setImportMsg(null)
    try {
      const supabase = createClient()
      const batchId = crypto.randomUUID()
      const rows = preview.map(r => ({
        brand_id: brand as string,
        sale_date: r.sale_date,
        product_sku: r.product_sku,
        product_name: r.product_name,
        qty_sold: r.qty_sold,
        revenue: r.revenue,
        import_batch: batchId,
        imported_by: profile?.id ?? null,
      }))
      const { error } = await (supabase.from('daily_sales') as any).insert(rows)
      if (error) throw error
      setImportMsg({ ok: true, text: `تم استيراد ${rows.length} سجل مبيعات بنجاح` })
      setPreview([])
      await loadHistory()
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

  const totalRevenue = preview.reduce((s, r) => s + r.revenue, 0)
  const totalQty = preview.reduce((s, r) => s + r.qty_sold, 0)

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">استيراد المبيعات</h1>
          <p className="text-gray-500 text-sm mt-0.5">استيراد بيانات المبيعات اليومية من Excel</p>
        </div>
        <button
          onClick={downloadSalesTemplate}
          className="flex items-center gap-2 text-sm px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
        >
          ⬇ تنزيل القالب
        </button>
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-300 hover:border-green-400 rounded-xl p-10 text-center cursor-pointer transition-colors bg-white"
      >
        <div className="text-4xl mb-3">📊</div>
        <p className="text-gray-600 font-medium">اضغط لاختيار ملف Excel</p>
        <p className="text-gray-400 text-sm mt-1">.xlsx أو .xls</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{parseError}</div>
      )}

      {preview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-6 flex-wrap">
            <span className="font-semibold text-gray-900">{preview.length} سجل</span>
            <span className="text-sm text-gray-500">إجمالي الإيراد: <span className="font-mono font-semibold text-gray-800">{totalRevenue.toFixed(2)} ر.س</span></span>
            <span className="text-sm text-gray-500">الوحدات المباعة: <span className="font-mono font-semibold text-gray-800">{totalQty}</span></span>
            <span className="text-sm text-gray-500">قبل VAT: <span className="font-mono font-semibold text-green-700">{(totalRevenue / 1.15).toFixed(2)} ر.س</span></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-4 py-2.5 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-2.5 font-medium">SKU</th>
                  <th className="text-right px-4 py-2.5 font-medium">المنتج</th>
                  <th className="text-left px-4 py-2.5 font-medium">الكمية</th>
                  <th className="text-left px-4 py-2.5 font-medium">الإيراد</th>
                  <th className="text-left px-4 py-2.5 font-medium">قبل VAT</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{r.sale_date}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.product_sku}</td>
                    <td className="px-4 py-2.5 text-gray-900 font-medium">{r.product_name}</td>
                    <td className="px-4 py-2.5 text-left font-mono text-gray-700">{r.qty_sold}</td>
                    <td className="px-4 py-2.5 text-left font-mono font-semibold text-gray-800">{r.revenue.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-left font-mono text-green-700">{(r.revenue / 1.15).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
            {importMsg && <span className={`text-sm ${importMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{importMsg.text}</span>}
            <div className="flex gap-2 mr-auto">
              <button onClick={() => setPreview([])} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">إلغاء</button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="text-sm px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {importing ? 'جارٍ الاستيراد...' : `استيراد ${preview.length} سجل`}
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
                <th className="text-center px-4 py-2.5 font-medium">السجلات</th>
                <th className="text-left px-4 py-2.5 font-medium">الوحدات</th>
                <th className="text-left px-4 py-2.5 font-medium">الإيراد الكلي</th>
                <th className="text-left px-4 py-2.5 font-medium">وقت الاستيراد</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.import_batch} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.sale_date}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{b.item_count}</td>
                  <td className="px-4 py-3 text-left font-mono text-gray-700">{b.total_qty}</td>
                  <td className="px-4 py-3 text-left font-mono font-semibold text-gray-800">{b.total_revenue.toFixed(2)} ر.س</td>
                  <td className="px-4 py-3 text-left text-xs text-gray-400 font-mono">{new Date(b.imported_at).toLocaleString('ar-SA')}</td>
                  <td className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleDeleteBatch(b.import_batch)}
                      disabled={deletingBatch === b.import_batch}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                    >
                      حذف
                    </button>
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

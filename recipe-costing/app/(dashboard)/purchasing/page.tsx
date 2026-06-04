'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { downloadPurchasesTemplate, parsePurchasesFile } from '@/lib/excel'
import type { PurchaseRow } from '@/types'

interface BatchSummary {
  import_batch: string
  purchase_date: string
  supplier_name: string
  item_count: number
  total_amount: number
  imported_at: string
}

export default function PurchasingPage() {
  const { brand } = useBrandStore()
  const { profile } = useUserStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<PurchaseRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [updatePrices, setUpdatePrices] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    const supabase = createClient()
    const { data } = await (supabase.from('purchases') as any)
      .select('import_batch, purchase_date, supplier_name, total_price, created_at')
      .eq('brand_id', brand)
      .order('created_at', { ascending: false })

    if (data) {
      const map = new Map<string, BatchSummary>()
      for (const row of data as any[]) {
        const b = row.import_batch
        if (!map.has(b)) {
          map.set(b, {
            import_batch: b,
            purchase_date: row.purchase_date,
            supplier_name: row.supplier_name,
            item_count: 0,
            total_amount: 0,
            imported_at: row.created_at,
          })
        }
        const s = map.get(b)!
        s.item_count++
        s.total_amount += row.total_price
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
      const rows = await parsePurchasesFile(file)
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
        purchase_date: r.purchase_date,
        supplier_name: r.supplier_name,
        ing_sku: r.ing_sku || null,
        ing_name: r.ing_name,
        qty: r.qty,
        unit: r.unit,
        total_price: r.total_price,
        unit_cost: r.unit_cost,
        import_batch: batchId,
        imported_by: profile?.id ?? null,
      }))

      const { error } = await (supabase.from('purchases') as any).insert(rows)
      if (error) throw error

      if (updatePrices) {
        const withSku = preview.filter(r => r.ing_sku && r.unit_cost > 0)
        for (const r of withSku) {
          await (supabase.from('ingredients') as any)
            .update({ cost: r.unit_cost })
            .eq('sku', r.ing_sku)
            .eq('brand_id', brand as string)
        }
      }

      setImportMsg({ ok: true, text: `تم استيراد ${rows.length} صنف بنجاح${updatePrices ? ' وتحديث الأسعار' : ''}` })
      setPreview([])
      await loadHistory()
    } catch (err: any) {
      setImportMsg({ ok: false, text: `خطأ: ${err.message}` })
    } finally {
      setImporting(false)
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm('حذف هذه الدفعة من سجل المشتريات؟')) return
    setDeletingBatch(batchId)
    const supabase = createClient()
    await (supabase.from('purchases') as any).delete().eq('import_batch', batchId)
    setDeletingBatch(null)
    await loadHistory()
  }

  const totalPreview = preview.reduce((s, r) => s + r.total_price, 0)
  const suppliers = [...new Set(preview.map(r => r.supplier_name).filter(Boolean))]

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">استيراد المشتريات</h1>
          <p className="text-gray-500 text-sm mt-0.5">استيراد فواتير الشراء من Excel وتحديث أسعار المواد تلقائياً</p>
        </div>
        <button
          onClick={downloadPurchasesTemplate}
          className="flex items-center gap-2 text-sm px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
        >
          ⬇ تنزيل القالب
        </button>
      </div>

      {/* Upload zone */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-10 text-center cursor-pointer transition-colors bg-white"
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="text-gray-600 font-medium">اضغط لاختيار ملف Excel</p>
        <p className="text-gray-400 text-sm mt-1">.xlsx أو .xls</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{parseError}</div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-gray-900">معاينة — {preview.length} صنف</span>
              <span className="text-sm text-gray-500">إجمالي: <span className="font-mono font-semibold text-gray-800">{totalPreview.toFixed(2)} ر.س</span></span>
              {suppliers.length > 0 && (
                <span className="text-sm text-gray-500">الموردون: {suppliers.join('، ')}</span>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={updatePrices}
                onChange={e => setUpdatePrices(e.target.checked)}
                className="accent-blue-500"
              />
              تحديث أسعار المواد الخام تلقائياً
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                    <td className="px-4 py-2.5 text-gray-700">{r.supplier_name}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.ing_sku}</td>
                    <td className="px-4 py-2.5 text-gray-900 font-medium">{r.ing_name}</td>
                    <td className="px-4 py-2.5 text-left text-gray-600 font-mono">{r.qty} {r.unit}</td>
                    <td className="px-4 py-2.5 text-left font-mono font-semibold text-gray-800">{r.total_price.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-left font-mono text-blue-700">{r.unit_cost.toFixed(6)}</td>
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
              <button
                onClick={handleImport}
                disabled={importing}
                className="text-sm px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
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
                <th className="text-right px-4 py-2.5 font-medium">المورد</th>
                <th className="text-center px-4 py-2.5 font-medium">الأصناف</th>
                <th className="text-left px-4 py-2.5 font-medium">الإجمالي</th>
                <th className="text-left px-4 py-2.5 font-medium">وقت الاستيراد</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.import_batch} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.purchase_date}</td>
                  <td className="px-4 py-3 text-gray-800">{b.supplier_name}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{b.item_count}</td>
                  <td className="px-4 py-3 text-left font-mono font-semibold text-gray-800">{b.total_amount.toFixed(2)} ر.س</td>
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

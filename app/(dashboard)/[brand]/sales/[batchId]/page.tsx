'use client'

import type { BrandId } from '@/types'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VAT_RATE } from '@/lib/calculations'

interface SaleRecord {
  id: string
  sale_date: string
  product_name: string
  product_sku: string | null
  branch_name: string | null
  branch_ref: string | null
  qty_sold: number
  revenue: number
  tax_amount: number
  discount_amount: number
  cancel_amount: number
  cancel_qty: number
  source: string
}

export default function SalesBatchDetailPage() {
  const { batchId, brand } = useParams() as { batchId: string; brand: BrandId }
  const router = useRouter()

  const [rows, setRows]       = useState<SaleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await (supabase.from('daily_sales') as any)
        .select('id, sale_date, product_name, product_sku, branch_name, branch_ref, qty_sold, revenue, tax_amount, discount_amount, cancel_amount, cancel_qty, source')
        .eq('brand_id', brand)
        .eq('import_batch', batchId)
        .order('branch_name', { ascending: true })
        .order('product_name', { ascending: true })
      if (!data || data.length === 0) { setNotFound(true) }
      else { setRows(data as SaleRecord[]) }
      setLoading(false)
    }
    if (brand && batchId) load()
  }, [brand, batchId])

  const totalRevenue   = rows.reduce((s, r) => s + r.revenue, 0)
  const totalQty       = rows.reduce((s, r) => s + r.qty_sold, 0)
  const totalTax       = rows.reduce((s, r) => s + r.tax_amount, 0)
  const totalDiscount  = rows.reduce((s, r) => s + r.discount_amount, 0)
  const totalCancel    = rows.reduce((s, r) => s + r.cancel_amount, 0)
  const branches       = [...new Set(rows.map(r => r.branch_name).filter(Boolean))]

  const saleDate = rows[0]?.sale_date ?? ''
  const source   = rows[0]?.source ?? ''

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          ← رجوع
        </button>
        <div className="h-4 w-px bg-gray-300" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">تفاصيل دفعة المبيعات</h1>
          {saleDate && <p className="text-sm text-gray-400 mt-0.5 font-mono">{saleDate}</p>}
        </div>
        {source && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${source === 'foodics' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            {source === 'foodics' ? 'Foodics' : 'Excel'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-16 text-center text-gray-400">جارٍ التحميل...</div>
      ) : notFound ? (
        <div className="p-16 text-center text-gray-400">لم يتم العثور على هذه الدفعة</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">إجمالي الإيراد</div>
              <div className="text-xl font-bold font-mono text-green-700">{totalRevenue.toFixed(2)} ر.س</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">قبل VAT</div>
              <div className="text-xl font-bold font-mono text-blue-700">{(totalRevenue / VAT_RATE).toFixed(2)} ر.س</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">إجمالي الوجبات</div>
              <div className="text-xl font-bold font-mono text-gray-800">{totalQty}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">عدد الأصناف</div>
              <div className="text-xl font-bold font-mono text-gray-800">{rows.length}</div>
            </div>
          </div>

          {/* Extra stats row */}
          <div className="flex gap-4 flex-wrap text-sm">
            {totalTax > 0 && <span className="text-gray-500">ضريبة: <span className="font-mono font-semibold text-gray-700">{totalTax.toFixed(2)} ر.س</span></span>}
            {totalDiscount > 0 && <span className="text-gray-500">خصم: <span className="font-mono font-semibold text-gray-700">{totalDiscount.toFixed(2)} ر.س</span></span>}
            {totalCancel > 0 && <span className="text-gray-500">إلغاءات: <span className="font-mono font-semibold text-red-600">{totalCancel.toFixed(2)} ر.س</span></span>}
            {branches.length > 0 && <span className="text-gray-500">الفروع: <span className="font-semibold text-gray-700">{branches.join('، ')}</span></span>}
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table suppressHydrationWarning className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                    <th className="text-right px-4 py-3 font-medium">المنتج</th>
                    <th className="text-right px-4 py-3 font-medium">SKU</th>
                    <th className="text-right px-4 py-3 font-medium">الفرع</th>
                    <th className="text-left px-4 py-3 font-medium">الكمية</th>
                    <th className="text-left px-4 py-3 font-medium">الإيراد</th>
                    <th className="text-left px-4 py-3 font-medium">الضريبة</th>
                    <th className="text-left px-4 py-3 font-medium">الخصم</th>
                    <th className="text-left px-4 py-3 font-medium">إلغاء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.product_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.product_sku || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.branch_name || '—'}</td>
                      <td className="px-4 py-3 text-left font-mono text-gray-700">{r.qty_sold}</td>
                      <td className="px-4 py-3 text-left font-mono font-semibold text-green-700">{Number(r.revenue).toFixed(2)} ر.س</td>
                      <td className="px-4 py-3 text-left font-mono text-xs text-gray-400">{Number(r.tax_amount) > 0 ? Number(r.tax_amount).toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-left font-mono text-xs text-gray-400">{Number(r.discount_amount) > 0 ? Number(r.discount_amount).toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-left font-mono text-xs text-red-400">
                        {Number(r.cancel_qty) > 0 ? `${r.cancel_qty} / ${Number(r.cancel_amount).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-600">الإجمالي</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-gray-800">{totalQty}</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-green-700">{totalRevenue.toFixed(2)} ر.س</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-gray-500">{totalTax.toFixed(2)}</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-gray-500">{totalDiscount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-red-500">{totalCancel.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

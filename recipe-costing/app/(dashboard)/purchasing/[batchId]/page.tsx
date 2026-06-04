'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'

interface PurchaseRecord {
  id: string
  purchase_date: string
  supplier_name: string
  ing_name: string
  ing_sku: string | null
  qty: number
  unit: string
  total_price: number
  unit_cost: number
}

export default function PurchasingBatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>()
  const { brand } = useBrandStore()
  const router = useRouter()

  const [rows, setRows]         = useState<PurchaseRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await (supabase.from('purchases') as any)
        .select('id, purchase_date, supplier_name, ing_name, ing_sku, qty, unit, total_price, unit_cost')
        .eq('brand_id', brand)
        .eq('import_batch', batchId)
        .order('supplier_name', { ascending: true })
        .order('ing_name', { ascending: true })
      if (!data || data.length === 0) { setNotFound(true) }
      else { setRows(data as PurchaseRecord[]) }
      setLoading(false)
    }
    if (brand && batchId) load()
  }, [brand, batchId])

  const totalAmount  = rows.reduce((s, r) => s + r.total_price, 0)
  const suppliers    = [...new Set(rows.map(r => r.supplier_name).filter(Boolean))]
  const purchaseDate = rows[0]?.purchase_date ?? ''

  const bySupplier = rows.reduce((acc, r) => {
    if (!acc[r.supplier_name]) acc[r.supplier_name] = 0
    acc[r.supplier_name] += r.total_price
    return acc
  }, {} as Record<string, number>)

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
          <h1 className="text-xl font-bold text-gray-900">تفاصيل دفعة المشتريات</h1>
          {purchaseDate && <p className="text-sm text-gray-400 mt-0.5 font-mono">{purchaseDate}</p>}
        </div>
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
              <div className="text-xs text-gray-400 mb-1">إجمالي المشتريات</div>
              <div className="text-xl font-bold font-mono text-red-600">{totalAmount.toFixed(2)} ر.س</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">عدد الأصناف</div>
              <div className="text-xl font-bold font-mono text-gray-800">{rows.length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">عدد الموردين</div>
              <div className="text-xl font-bold font-mono text-gray-800">{suppliers.length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">التاريخ</div>
              <div className="text-base font-bold font-mono text-gray-700">{purchaseDate}</div>
            </div>
          </div>

          {/* Supplier breakdown */}
          {suppliers.length > 1 && (
            <div className="flex gap-3 flex-wrap">
              {Object.entries(bySupplier).map(([sup, amt]) => (
                <div key={sup} className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-700">{sup}</span>
                  <span className="text-gray-400">|</span>
                  <span className="font-mono font-semibold text-red-600">{amt.toFixed(2)} ر.س</span>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                    <th className="text-right px-4 py-3 font-medium">المادة</th>
                    <th className="text-right px-4 py-3 font-medium">SKU</th>
                    <th className="text-right px-4 py-3 font-medium">المورد</th>
                    <th className="text-left px-4 py-3 font-medium">الكمية</th>
                    <th className="text-left px-4 py-3 font-medium">الإجمالي</th>
                    <th className="text-left px-4 py-3 font-medium">تكلفة/وحدة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.ing_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.ing_sku || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.supplier_name}</td>
                      <td className="px-4 py-3 text-left font-mono text-gray-700">{Number(r.qty).toFixed(2)} {r.unit}</td>
                      <td className="px-4 py-3 text-left font-mono font-semibold text-gray-800">{Number(r.total_price).toFixed(2)} ر.س</td>
                      <td className="px-4 py-3 text-left font-mono text-blue-700 text-xs">{Number(r.unit_cost).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-600">الإجمالي</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-gray-800">{rows.length} صنف</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-red-600">{totalAmount.toFixed(2)} ر.س</td>
                    <td />
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

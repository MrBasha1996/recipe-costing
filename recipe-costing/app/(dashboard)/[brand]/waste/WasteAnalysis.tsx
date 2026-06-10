'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatYearMonth, monthRange } from '@/lib/period'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { WasteLog } from '@/types'
type WasteType = WasteLog['waste_type']

const WASTE_LABELS: Record<WasteType, string> = {
  cancellation: 'إلغاء', return: 'مرتجع', spoilage: 'تلف', expiry: 'انتهاء صلاحية', other: 'أخرى',
}
const WASTE_TYPES: WasteType[] = ['cancellation', 'return', 'spoilage', 'expiry', 'other']
const CHART_COLORS = ['#ef4444', '#3b82f6', '#f97316', '#8b5cf6', '#64748b']

export default function WasteAnalysis({ brand, months }: { brand: string; months: string[] }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nMonths, setNMonths] = useState(3)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const sinceMonth = months[Math.min(nMonths - 1, months.length - 1)]
      const { start } = monthRange(sinceMonth)
      const { end }   = monthRange(months[0])
      const { data } = await (supabase.from('waste_log') as any)
        .select('product_name, product_sku, branch_name, waste_type, qty, value, was_wasted, log_date')
        .eq('brand_id', brand)
        .gte('log_date', start)
        .lte('log_date', end)
        .order('log_date', { ascending: false })
      setLogs((data || []) as any[])
      setLoading(false)
    }
    load()
  }, [brand, nMonths, months])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحليل...</div>
  if (!logs.length) return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
      لا توجد سجلات هدر في هذه الفترة
    </div>
  )

  const totalValue  = logs.reduce((s, r) => s + r.value, 0)
  const wastedValue = logs.filter(r => r.was_wasted).reduce((s, r) => s + r.value, 0)

  const byType = WASTE_TYPES.reduce((acc: any, t) => {
    const items = logs.filter(r => r.waste_type === t)
    acc[t] = { value: items.reduce((s: number, r: any) => s + r.value, 0), count: items.length }
    return acc
  }, {} as Record<string, { value: number; count: number }>)

  const typeChartData = WASTE_TYPES
    .filter(t => byType[t].value > 0)
    .map(t => ({ name: WASTE_LABELS[t], value: byType[t].value, count: byType[t].count }))
    .sort((a, b) => b.value - a.value)

  const byProduct = new Map<string, { name: string; value: number; count: number; wastedValue: number }>()
  for (const r of logs as any[]) {
    const key = r.product_sku || r.product_name
    const ex = byProduct.get(key)
    if (ex) { ex.value += r.value; ex.count++; if (r.was_wasted) ex.wastedValue += r.value }
    else byProduct.set(key, { name: r.product_name, value: r.value, count: 1, wastedValue: r.was_wasted ? r.value : 0 })
  }
  const top10 = [...byProduct.values()].sort((a, b) => b.value - a.value).slice(0, 10)

  const byBranch = new Map<string, number>()
  for (const r of logs as any[]) {
    const b = r.branch_name || 'غير محدد'
    byBranch.set(b, (byBranch.get(b) ?? 0) + r.value)
  }
  const branchData = [...byBranch.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  const monthlyMap = new Map<string, number>()
  for (const r of logs as any[]) {
    const m = r.log_date.slice(0, 7)
    monthlyMap.set(m, (monthlyMap.get(m) ?? 0) + r.value)
  }
  const monthlyData = [...monthlyMap.entries()].sort().map(([m, v]) => ({ month: formatYearMonth(m), value: v }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">تحليل الهدر السببي</h2>
          <p className="text-xs text-gray-500 mt-0.5">{logs.length} سجل · {totalValue.toFixed(2)} ر.س إجمالي</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[1, 3, 6].map(n => (
            <button key={n} onClick={() => setNMonths(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${nMonths === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              آخر {n} {n === 1 ? 'شهر' : 'أشهر'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">إجمالي قيمة الهدر</div>
          <div className="text-xl font-bold font-mono text-red-600">{totalValue.toFixed(2)} ر.س</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">هدر فعلي (تالف)</div>
          <div className="text-xl font-bold font-mono text-orange-600">{wastedValue.toFixed(2)} ر.س</div>
          <div className="text-xs text-gray-400 mt-0.5">{totalValue > 0 ? ((wastedValue / totalValue) * 100).toFixed(0) : 0}% من الإجمالي</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">إلغاء/مرتجع</div>
          <div className="text-xl font-bold font-mono text-blue-600">{(totalValue - wastedValue).toFixed(2)} ر.س</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">أصناف متأثرة</div>
          <div className="text-xl font-bold font-mono text-gray-800">{byProduct.size}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">توزيع الهدر حسب النوع (ر.س)</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={typeChartData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name"
                label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                {typeChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} ر.س`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">قيمة الهدر الشهرية (ر.س)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} ر.س`]} />
              <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} name="الهدر" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="font-semibold text-sm text-gray-900">أعلى 10 منتجات هدراً</span>
        </div>
        <table suppressHydrationWarning className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
              <th className="text-right px-4 py-2.5 font-medium">#</th>
              <th className="text-right px-4 py-2.5 font-medium">المنتج</th>
              <th className="text-center px-4 py-2.5 font-medium">التكرار</th>
              <th className="text-left px-4 py-2.5 font-medium">القيمة</th>
              <th className="text-left px-4 py-2.5 font-medium">هدر فعلي</th>
              <th className="text-left px-4 py-2.5 font-medium">النسبة</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((p, i) => (
              <tr key={i} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900 text-sm">{p.name}</td>
                <td className="px-4 py-2.5 text-center font-mono text-gray-600 text-xs">{p.count}</td>
                <td className="px-4 py-2.5 font-mono font-semibold text-red-600 text-xs">{p.value.toFixed(2)} ر.س</td>
                <td className="px-4 py-2.5 font-mono text-orange-600 text-xs">{p.wastedValue.toFixed(2)} ر.س</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min((p.value / totalValue) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 font-mono">{((p.value / totalValue) * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {branchData.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="font-semibold text-sm text-gray-900">الهدر حسب الفرع</span>
          </div>
          <table suppressHydrationWarning className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
                <th className="text-right px-4 py-2.5 font-medium">الفرع</th>
                <th className="text-left px-4 py-2.5 font-medium">القيمة</th>
                <th className="text-left px-4 py-2.5 font-medium">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {branchData.map((b, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-gray-900 text-sm">{b.name}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-red-600 text-sm">{b.value.toFixed(2)} ر.س</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min((b.value / totalValue) * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 font-mono">{((b.value / totalValue) * 100).toFixed(1)}%</span>
                    </div>
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

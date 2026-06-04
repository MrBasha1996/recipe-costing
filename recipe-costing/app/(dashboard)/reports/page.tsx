'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { getCurrentYearMonth, lastNMonths, formatYearMonth, monthRange } from '@/lib/period'
import { exportPLReport } from '@/lib/excel'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

type ReportTab = 'pl' | 'fc' | 'breakeven' | 'purchases' | 'sales'

// ── Helpers ────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color ?? 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-700 mb-3 mt-6 first:mt-0">{children}</h3>
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

// ── Main Page ──────────────────────────────────────────────────────
export default function ReportsPage() {
  const { brand } = useBrandStore()
  const months = lastNMonths(12)
  const [tab, setTab] = useState<ReportTab>('pl')
  const [month, setMonth] = useState(getCurrentYearMonth())

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'pl',        label: 'الأرباح والخسائر' },
    { key: 'fc',        label: 'تحليل Food Cost' },
    { key: 'breakeven', label: 'نقطة التعادل' },
    { key: 'purchases', label: 'تحليل المشتريات' },
    { key: 'sales',     label: 'تحليل المبيعات' },
  ]

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">التقارير المالية والإدارية</h1>
          <p className="text-gray-500 text-sm mt-0.5">تحليل شامل للتكاليف والإيرادات والأداء</p>
        </div>
        <select value={month} onChange={e => setMonth(e.target.value)} className={inputCls}>
          {months.map(m => <option key={m} value={m}>{formatYearMonth(m)}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pl'        && <PLReport        brand={brand} month={month} />}
      {tab === 'fc'        && <FCReport         brand={brand} month={month} />}
      {tab === 'breakeven' && <BreakevenReport  brand={brand} month={month} />}
      {tab === 'purchases' && <PurchasesReport  brand={brand} month={month} />}
      {tab === 'sales'     && <SalesReport      brand={brand} month={month} />}
    </div>
  )
}

// ── 1. P&L Report ─────────────────────────────────────────────────
function PLReport({ brand, month }: { brand: string; month: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const [{ data: sales }, { data: purchases }, { data: labor }, { data: overhead }] = await Promise.all([
      (supabase.from('daily_sales') as any).select('revenue').eq('brand_id', brand).gte('sale_date', monthStart).lte('sale_date', monthEnd),
      (supabase.from('purchases') as any).select('total_price').eq('brand_id', brand).gte('purchase_date', monthStart).lte('purchase_date', monthEnd),
      (supabase.from('labor_costs') as any).select('amount').eq('brand_id', brand).eq('month', month),
      (supabase.from('overhead_costs') as any).select('amount, category').eq('brand_id', brand).eq('month', month),
    ])

    const totalRevWithVat = (sales || []).reduce((s: number, r: any) => s + r.revenue, 0)
    const revenue         = totalRevWithVat / 1.15
    const materialCost    = (purchases || []).reduce((s: number, r: any) => s + r.total_price, 0)
    const laborCost       = (labor || []).reduce((s: number, r: any) => s + r.amount, 0)
    const overheadCost    = (overhead || []).reduce((s: number, r: any) => s + r.amount, 0)
    const totalCost       = materialCost + laborCost + overheadCost
    const grossProfit     = revenue - materialCost
    const netProfit       = revenue - totalCost
    const vat             = totalRevWithVat - revenue

    const ovByCategory = (overhead || []).reduce((acc: any, r: any) => {
      acc[r.category] = (acc[r.category] || 0) + r.amount
      return acc
    }, {})

    setData({ revenue, totalRevWithVat, vat, materialCost, laborCost, overheadCost, totalCost, grossProfit, netProfit, ovByCategory })
    setLoading(false)
  }, [brand, month])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!data) return null

  const r = data.revenue
  const pct = (v: number) => r > 0 ? `${((v / r) * 100).toFixed(1)}%` : '—'

  const barData = [
    { name: 'الإيراد', value: r },
    { name: 'المواد الخام', value: data.materialCost },
    { name: 'العمالة', value: data.laborCost },
    { name: 'التشغيل', value: data.overheadCost },
    { name: 'صافي الربح', value: Math.max(0, data.netProfit) },
  ]

  const pieData = [
    { name: 'مواد خام', value: data.materialCost },
    { name: 'عمالة', value: data.laborCost },
    { name: 'تشغيل', value: data.overheadCost },
    { name: 'ربح صافي', value: Math.max(0, data.netProfit) },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="الإيراد (قبل VAT)" value={`${r.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س`} sub={`VAT: ${data.vat.toFixed(0)} ر.س`} color="text-blue-700" />
        <KpiCard label="إجمالي التكاليف" value={`${data.totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س`} sub={pct(data.totalCost)} color="text-red-600" />
        <KpiCard label="مجمل الربح (Gross)" value={`${data.grossProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س`} sub={pct(data.grossProfit)} color={data.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
        <KpiCard label="صافي الربح (Net)" value={`${data.netProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س`} sub={pct(data.netProfit)} color={data.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* P&L Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-900">بيان الأرباح والخسائر — {formatYearMonth(month)}</span>
            <button
              onClick={() => exportPLReport({ month, brand, revenue: r, materialCost: data.materialCost, laborCost: data.laborCost, overheadCost: data.overheadCost, rows: [] }).catch(console.error)}
              className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              ⬇ Excel
            </button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'الإيراد (قبل VAT)',    value: r,                   bold: true,  color: 'text-blue-700' },
                { label: 'ضريبة القيمة المضافة', value: data.vat,             color: 'text-gray-500' },
                { label: '─',                     value: null },
                { label: 'تكلفة المواد الخام',   value: -data.materialCost,   color: 'text-red-600' },
                { label: 'مجمل الربح (Gross Profit)', value: data.grossProfit, bold: true, color: data.grossProfit >= 0 ? 'text-green-700' : 'text-red-700' },
                { label: '─',                     value: null },
                { label: 'تكاليف العمالة',        value: -data.laborCost,      color: 'text-red-500' },
                { label: 'التكاليف الثابتة',      value: -data.overheadCost,   color: 'text-red-500' },
                { label: '─',                     value: null },
                { label: 'صافي الربح (Net Profit)', value: data.netProfit,    bold: true, color: data.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700' },
                { label: 'هامش صافي الربح',        value: null,               pct: pct(data.netProfit), color: 'text-gray-500' },
              ].map((row, i) => row.label === '─' ? (
                <tr key={i}><td colSpan={3} className="px-4 py-1"><hr className="border-gray-200" /></td></tr>
              ) : (
                <tr key={i} className={`${row.bold ? 'bg-gray-50' : ''} border-b border-gray-100`}>
                  <td className={`px-4 py-3 ${row.bold ? 'font-semibold' : ''} text-gray-700`}>{row.label}</td>
                  <td className={`px-4 py-3 text-left font-mono ${row.bold ? 'font-bold text-base' : ''} ${row.color ?? 'text-gray-800'}`}>
                    {row.value != null ? `${row.value >= 0 ? '' : ''}${Math.abs(row.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س` : row.pct ?? ''}
                  </td>
                  <td className="px-4 py-3 text-left text-xs text-gray-400 font-mono">
                    {row.value != null && r > 0 ? pct(Math.abs(row.value)) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Charts */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">توزيع التكاليف والإيراد</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(0)} ر.س`]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">توزيع التكاليف</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v.toFixed(0)} ر.س`]} />
                <Legend iconType="circle" iconSize={10} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 2. FC Analysis ────────────────────────────────────────────────
function FCReport({ brand, month }: { brand: string; month: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const { data: sales } = await (supabase.from('daily_sales') as any)
      .select('product_sku, product_name, qty_sold, revenue')
      .eq('brand_id', brand).gte('sale_date', monthStart).lte('sale_date', monthEnd)

    if (!sales || sales.length === 0) { setRows([]); setLoading(false); return }

    // Group by product
    const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const s of sales as any[]) {
      const key = s.product_sku
      if (!productMap.has(key)) productMap.set(key, { name: s.product_name, qty: 0, revenue: 0 })
      const p = productMap.get(key)!
      p.qty += s.qty_sold
      p.revenue += s.revenue
    }

    const skus = [...productMap.keys()]
    const { data: recipes } = await (supabase.from('recipes') as any)
      .select('sku, total_cost, yield_portions, food_cost_pct')
      .eq('brand_id', brand).eq('is_active', true).in('sku', skus)

    const recipeMap = new Map<string, any>()
    for (const r of (recipes || []) as any[]) recipeMap.set(r.sku, r)

    const result = [...productMap.entries()].map(([sku, p]) => {
      const rec = recipeMap.get(sku)
      const revenueExVat = p.revenue / 1.15
      const theoreticalCostPerUnit = rec ? rec.total_cost / Math.max(rec.yield_portions, 1) : 0
      const totalTheoreticalCost = theoreticalCostPerUnit * p.qty
      const actualFcPct = revenueExVat > 0 ? (totalTheoreticalCost / revenueExVat) * 100 : 0
      const recipeFcPct = rec?.food_cost_pct ?? null
      return {
        sku, name: p.name, qty: p.qty,
        revenue: revenueExVat,
        theoreticalCost: totalTheoreticalCost,
        actualFcPct,
        recipeFcPct,
        variance: recipeFcPct != null ? actualFcPct - recipeFcPct : null,
      }
    }).sort((a, b) => b.revenue - a.revenue)

    setRows(result)
    setLoading(false)
  }, [brand, month])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>

  const totalRevenue  = rows.reduce((s, r) => s + r.revenue, 0)
  const totalCost     = rows.reduce((s, r) => s + r.theoreticalCost, 0)
  const avgFc         = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="إجمالي الإيراد (قبل VAT)" value={`${totalRevenue.toFixed(0)} ر.س`} color="text-blue-700" />
        <KpiCard label="تكلفة المواد النظرية" value={`${totalCost.toFixed(0)} ر.س`} color="text-red-600" />
        <KpiCard label="متوسط Food Cost %" value={`${avgFc.toFixed(1)}%`} color={avgFc <= 35 ? 'text-green-700' : avgFc <= 45 ? 'text-amber-600' : 'text-red-700'} />
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">لا توجد بيانات مبيعات لهذا الشهر</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-4 py-3 font-medium">المنتج</th>
                  <th className="text-center px-4 py-3 font-medium">الكمية</th>
                  <th className="text-left px-4 py-3 font-medium">الإيراد</th>
                  <th className="text-left px-4 py-3 font-medium">تكلفة المواد</th>
                  <th className="text-center px-4 py-3 font-medium">FC% (الوصفة)</th>
                  <th className="text-center px-4 py-3 font-medium">FC% (الفعلي)</th>
                  <th className="text-center px-4 py-3 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{r.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 font-mono">{r.qty}</td>
                    <td className="px-4 py-3 text-left font-mono text-gray-800">{r.revenue.toFixed(2)}</td>
                    <td className="px-4 py-3 text-left font-mono text-red-600">{r.theoreticalCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      {r.recipeFcPct != null ? (
                        <span className={`font-mono text-xs font-semibold ${r.recipeFcPct <= 35 ? 'text-green-600' : r.recipeFcPct <= 45 ? 'text-amber-600' : 'text-red-600'}`}>
                          {r.recipeFcPct.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-mono text-xs font-semibold ${r.actualFcPct <= 35 ? 'text-green-600' : r.actualFcPct <= 45 ? 'text-amber-600' : 'text-red-600'}`}>
                        {r.actualFcPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.actualFcPct <= 35 ? 'bg-green-50 text-green-700' : r.actualFcPct <= 45 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {r.actualFcPct <= 35 ? 'ممتاز' : r.actualFcPct <= 45 ? 'مقبول' : 'مرتفع'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 3. Break-even ─────────────────────────────────────────────────
function BreakevenReport({ brand, month }: { brand: string; month: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const [{ data: sales }, { data: labor }, { data: overhead }] = await Promise.all([
      (supabase.from('daily_sales') as any).select('revenue, qty_sold, product_sku').eq('brand_id', brand).gte('sale_date', monthStart).lte('sale_date', monthEnd),
      (supabase.from('labor_costs') as any).select('amount').eq('brand_id', brand).eq('month', month),
      (supabase.from('overhead_costs') as any).select('amount').eq('brand_id', brand).eq('month', month),
    ])

    const totalRevWithVat = (sales || []).reduce((s: number, r: any) => s + r.revenue, 0)
    const totalQty        = (sales || []).reduce((s: number, r: any) => s + r.qty_sold, 0)
    const revenue         = totalRevWithVat / 1.15
    const fixedCosts      = [...(labor || []), ...(overhead || [])].reduce((s: number, r: any) => s + r.amount, 0)

    const skus = [...new Set((sales || []).map((s: any) => s.product_sku))]
    let theoreticalMaterialCost = 0

    if (skus.length > 0) {
      const { data: recipes } = await (supabase.from('recipes') as any)
        .select('sku, total_cost, yield_portions').eq('brand_id', brand).eq('is_active', true).in('sku', skus)
      const recipeMap = new Map<string, any>()
      for (const r of (recipes || []) as any[]) recipeMap.set(r.sku, r)
      for (const s of (sales || []) as any[]) {
        const rec = recipeMap.get(s.product_sku)
        if (rec) theoreticalMaterialCost += (rec.total_cost / Math.max(rec.yield_portions, 1)) * s.qty_sold
      }
    }

    const avgRevenuePerCover = totalQty > 0 ? revenue / totalQty : 0
    const avgVarCostPerCover = totalQty > 0 ? theoreticalMaterialCost / totalQty : 0
    const contributionMargin = avgRevenuePerCover - avgVarCostPerCover
    const breakevenCovers    = contributionMargin > 0 ? fixedCosts / contributionMargin : 0
    const daysInMonth        = 30
    const breakevenPerDay    = breakevenCovers / daysInMonth
    const cmRatio            = avgRevenuePerCover > 0 ? (contributionMargin / avgRevenuePerCover) * 100 : 0
    const breakevenRevenue   = cmRatio > 0 ? (fixedCosts / cmRatio) * 100 : 0
    const currentFcPct       = revenue > 0 ? (theoreticalMaterialCost / revenue) * 100 : 0
    const safetyMargin       = revenue > 0 ? ((revenue - breakevenRevenue) / revenue) * 100 : 0

    setData({
      revenue, totalQty, fixedCosts, theoreticalMaterialCost,
      avgRevenuePerCover, avgVarCostPerCover, contributionMargin,
      breakevenCovers, breakevenPerDay, cmRatio, breakevenRevenue,
      currentFcPct, safetyMargin,
    })
    setLoading(false)
  }, [brand, month])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!data) return null

  const d = data
  const chartData = [
    { name: 'إيراد متغير', value: d.avgRevenuePerCover },
    { name: 'تكلفة متغيرة', value: d.avgVarCostPerCover },
    { name: 'هامش المساهمة', value: d.contributionMargin },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="التكاليف الثابتة" value={`${d.fixedCosts.toFixed(0)} ر.س`} color="text-red-600" sub="عمالة + تشغيل" />
        <KpiCard label="هامش المساهمة/وجبة" value={`${d.contributionMargin.toFixed(2)} ر.س`} color="text-blue-700" sub={`نسبة: ${d.cmRatio.toFixed(1)}%`} />
        <KpiCard label="نقطة التعادل (وجبات)" value={`${Math.ceil(d.breakevenCovers)} وجبة`} color="text-amber-700" sub={`${Math.ceil(d.breakevenPerDay)} وجبة/يوم`} />
        <KpiCard label="هامش الأمان" value={`${d.safetyMargin.toFixed(1)}%`} color={d.safetyMargin > 20 ? 'text-green-700' : d.safetyMargin > 0 ? 'text-amber-600' : 'text-red-700'} sub={`إيراد التعادل: ${d.breakevenRevenue.toFixed(0)} ر.س`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionTitle>معادلة نقطة التعادل</SectionTitle>
          <div className="space-y-3 text-sm">
            {[
              { label: 'متوسط الإيراد/وجبة', value: `${d.avgRevenuePerCover.toFixed(2)} ر.س`, color: 'text-blue-700' },
              { label: 'متوسط التكلفة المتغيرة/وجبة', value: `${d.avgVarCostPerCover.toFixed(2)} ر.س`, color: 'text-red-600' },
              { label: 'هامش المساهمة/وجبة', value: `${d.contributionMargin.toFixed(2)} ر.س`, color: 'text-emerald-700', bold: true },
              { label: 'إجمالي التكاليف الثابتة', value: `${d.fixedCosts.toFixed(2)} ر.س`, color: 'text-gray-700' },
              { label: 'وجبات التعادل (شهري)', value: `${Math.ceil(d.breakevenCovers)} وجبة`, color: 'text-amber-700', bold: true },
              { label: 'وجبات التعادل (يومي)', value: `${Math.ceil(d.breakevenPerDay)} وجبة`, color: 'text-amber-700', bold: true },
              { label: 'إيراد التعادل', value: `${d.breakevenRevenue.toFixed(0)} ر.س`, color: 'text-gray-700' },
              { label: 'الإيراد الفعلي', value: `${d.revenue.toFixed(0)} ر.س`, color: 'text-blue-700' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">{row.label}</span>
                <span className={`font-mono font-${row.bold ? 'bold' : 'medium'} ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionTitle>هامش المساهمة/وجبة</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)} ر.س`]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className={`mt-4 rounded-lg p-3 text-sm text-center ${d.safetyMargin > 20 ? 'bg-green-50 text-green-800' : d.safetyMargin > 0 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'}`}>
            {d.safetyMargin > 20
              ? `هامش أمان ممتاز — الإيراد يتجاوز نقطة التعادل بـ ${d.safetyMargin.toFixed(1)}%`
              : d.safetyMargin > 0
              ? `تحذير — هامش الأمان منخفض (${d.safetyMargin.toFixed(1)}%)`
              : `خطر — الإيراد الحالي أقل من نقطة التعادل`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 4. Purchases Analysis ─────────────────────────────────────────
function PurchasesReport({ brand, month }: { brand: string; month: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const { data: purchases } = await (supabase.from('purchases') as any)
      .select('*').eq('brand_id', brand).gte('purchase_date', monthStart).lte('purchase_date', monthEnd)

    if (!purchases || purchases.length === 0) { setData(null); setLoading(false); return }

    const rows = purchases as any[]
    const total = rows.reduce((s: number, r: any) => s + r.total_price, 0)

    const bySupplier = rows.reduce((acc: any, r: any) => {
      acc[r.supplier_name] = (acc[r.supplier_name] || 0) + r.total_price
      return acc
    }, {})

    const byItem = rows.reduce((acc: any, r: any) => {
      const key = r.ing_name
      if (!acc[key]) acc[key] = { name: r.ing_name, sku: r.ing_sku, total: 0, qty: 0, unit: r.unit }
      acc[key].total += r.total_price
      acc[key].qty   += r.qty
      return acc
    }, {})

    const byDate = rows.reduce((acc: any, r: any) => {
      const d = r.purchase_date
      acc[d] = (acc[d] || 0) + r.total_price
      return acc
    }, {})

    setData({
      total,
      supplierData: Object.entries(bySupplier).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value),
      itemData: Object.values(byItem).sort((a: any, b: any) => b.total - a.total).slice(0, 15) as any[],
      dateData: Object.entries(byDate).sort().map(([date, value]) => ({ date, value: value as number })),
    })
    setLoading(false)
  }, [brand, month])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!data) return <div className="py-16 text-center text-gray-400">لا توجد مشتريات لهذا الشهر</div>

  return (
    <div className="space-y-5">
      <KpiCard label="إجمالي المشتريات" value={`${data.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س`} color="text-red-600" sub={`${formatYearMonth(month)}`} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionTitle>الإنفاق بالمورد</SectionTitle>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={data.supplierData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name">
                {data.supplierData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => [`${v.toFixed(0)} ر.س`]} />
              <Legend iconType="circle" iconSize={10} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionTitle>الإنفاق اليومي</SectionTitle>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.dateData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(0)} ر.س`]} />
              <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={false} name="الإنفاق" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <span className="font-semibold text-gray-900">أعلى الأصناف إنفاقاً</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <th className="text-right px-4 py-2.5 font-medium">#</th>
              <th className="text-right px-4 py-2.5 font-medium">المادة</th>
              <th className="text-left px-4 py-2.5 font-medium">الكمية</th>
              <th className="text-left px-4 py-2.5 font-medium">الإجمالي</th>
              <th className="text-left px-4 py-2.5 font-medium">النسبة</th>
            </tr>
          </thead>
          <tbody>
            {data.itemData.map((r: any, i: number) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <div className="text-gray-800 font-medium">{r.name}</div>
                  {r.sku && <div className="text-xs text-gray-400 font-mono">{r.sku}</div>}
                </td>
                <td className="px-4 py-2.5 text-left font-mono text-gray-600">{r.qty.toFixed(2)} {r.unit}</td>
                <td className="px-4 py-2.5 text-left font-mono font-semibold text-red-600">{r.total.toFixed(2)} ر.س</td>
                <td className="px-4 py-2.5 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min((r.total / data.total) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 font-mono">{((r.total / data.total) * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 5. Sales Analysis ─────────────────────────────────────────────
function SalesReport({ brand, month }: { brand: string; month: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const { data: sales } = await (supabase.from('daily_sales') as any)
      .select('*').eq('brand_id', brand).gte('sale_date', monthStart).lte('sale_date', monthEnd)

    if (!sales || sales.length === 0) { setData(null); setLoading(false); return }

    const rows = sales as any[]
    const totalRev  = rows.reduce((s: number, r: any) => s + r.revenue, 0)
    const totalQty  = rows.reduce((s: number, r: any) => s + r.qty_sold, 0)

    const byDate = rows.reduce((acc: any, r: any) => {
      if (!acc[r.sale_date]) acc[r.sale_date] = { date: r.sale_date, revenue: 0, qty: 0 }
      acc[r.sale_date].revenue += r.revenue / 1.15
      acc[r.sale_date].qty     += r.qty_sold
      return acc
    }, {})

    const byProduct = rows.reduce((acc: any, r: any) => {
      const key = r.product_sku
      if (!acc[key]) acc[key] = { name: r.product_name, sku: key, revenue: 0, qty: 0 }
      acc[key].revenue += r.revenue / 1.15
      acc[key].qty     += r.qty_sold
      return acc
    }, {})

    setData({
      totalRev: totalRev / 1.15,
      totalRevWithVat: totalRev,
      totalQty,
      avgPerCover: totalQty > 0 ? (totalRev / 1.15) / totalQty : 0,
      dateData: Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)),
      topByRevenue: Object.values(byProduct).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 10) as any[],
      topByQty:     Object.values(byProduct).sort((a: any, b: any) => b.qty - a.qty).slice(0, 10) as any[],
    })
    setLoading(false)
  }, [brand, month])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!data) return <div className="py-16 text-center text-gray-400">لا توجد مبيعات لهذا الشهر</div>

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="الإيراد (قبل VAT)" value={`${data.totalRev.toFixed(0)} ر.س`} color="text-green-700" />
        <KpiCard label="الإيراد (شامل VAT)" value={`${data.totalRevWithVat.toFixed(0)} ر.س`} color="text-gray-700" />
        <KpiCard label="إجمالي الوجبات" value={`${data.totalQty} وجبة`} color="text-blue-700" />
        <KpiCard label="متوسط الوجبة" value={`${data.avgPerCover.toFixed(2)} ر.س`} color="text-indigo-700" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <SectionTitle>الإيراد اليومي (قبل VAT)</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.dateData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => [`${v.toFixed(0)} ر.س`]} />
            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="الإيراد" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[
          { title: 'أعلى 10 منتجات بالإيراد', rows: data.topByRevenue, key: 'revenue', unit: 'ر.س', total: data.totalRev },
          { title: 'أعلى 10 منتجات بالكمية', rows: data.topByQty,     key: 'qty',     unit: 'وجبة', total: data.totalQty },
        ].map(section => (
          <div key={section.title} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
              <span className="font-semibold text-gray-900 text-sm">{section.title}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-right px-4 py-2 font-medium">#</th>
                  <th className="text-right px-4 py-2 font-medium">المنتج</th>
                  <th className="text-left px-4 py-2 font-medium">{section.unit}</th>
                  <th className="text-left px-4 py-2 font-medium">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2 text-gray-800 text-xs">{r.name}</td>
                    <td className="px-4 py-2 text-left font-mono text-xs font-semibold text-green-700">
                      {typeof r[section.key] === 'number' ? r[section.key].toFixed(section.key === 'qty' ? 0 : 2) : r[section.key]} {section.key === 'revenue' ? 'ر.س' : ''}
                    </td>
                    <td className="px-4 py-2 text-left">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.min((r[section.key] / section.total) * 100, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 font-mono">{((r[section.key] / section.total) * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

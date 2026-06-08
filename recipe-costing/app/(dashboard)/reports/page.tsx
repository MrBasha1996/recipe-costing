'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { getCurrentYearMonth, lastNMonths, formatYearMonth, monthRange } from '@/lib/period'
import { VAT_RATE } from '@/lib/calculations'
import { exportPLReport } from '@/lib/excel'
import { exportToPDF } from '@/lib/pdf'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine, ZAxis,
} from 'recharts'

type ReportTab = 'pl' | 'fc' | 'breakeven' | 'purchases' | 'sales' | 'menu' | 'variance' | 'primecost' | 'pricing' | 'trends' | 'branches' | 'prices' | 'actual-fc' | 'dine' | 'discounts' | 'consumption' | 'compare-pl'

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

function wb(q: any, branch: string) { return branch ? q.eq('branch_name', branch) : q }

// ── Main Page ──────────────────────────────────────────────────────
export default function ReportsPage() {
  const { brand } = useBrandStore()
  const months = lastNMonths(12)
  const [tab, setTab] = useState<ReportTab>('pl')
  const [month, setMonth] = useState(getCurrentYearMonth())
  const [branch, setBranch] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [fcLow, setFcLow]   = useState(35)
  const [fcHigh, setFcHigh] = useState(45)

  useEffect(() => {
    if (!brand) return
    const supabase = createClient()
    Promise.all([
      (supabase.from('daily_sales') as any)
        .select('branch_name').eq('brand_id', brand).not('branch_name', 'is', null),
      (supabase.from('brands') as any)
        .select('fc_target_low, fc_target_high').eq('id', brand).single(),
    ]).then(([{ data: salesData }, { data: brandRow }]) => {
      const uniq = [...new Set((salesData || []).map((r: any) => r.branch_name as string).filter((x: unknown): x is string => Boolean(x)))].sort()
      setBranches(uniq)
      if (brandRow) {
        setFcLow(brandRow.fc_target_low ?? 35)
        setFcHigh(brandRow.fc_target_high ?? 45)
      }
    })
  }, [brand])

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'pl',        label: 'الأرباح والخسائر' },
    { key: 'fc',        label: 'تحليل Food Cost' },
    { key: 'breakeven', label: 'نقطة التعادل' },
    { key: 'purchases', label: 'تحليل المشتريات' },
    { key: 'sales',     label: 'تحليل المبيعات' },
    { key: 'menu',      label: 'هندسة القائمة' },
    { key: 'variance',  label: 'مقارنة FC%' },
    { key: 'primecost', label: 'التكلفة الإجمالية' },
    { key: 'pricing',   label: 'التسعير العكسي' },
    { key: 'trends',    label: 'الاتجاهات' },
    { key: 'branches',  label: 'مقارنة الفروع' },
    { key: 'prices',    label: 'تاريخ الأسعار' },
    { key: 'actual-fc', label: 'FC فعلي vs نظري' },
    { key: 'dine',        label: 'داخل vs توصيل' },
    { key: 'discounts',   label: 'الخصومات والمرتجعات' },
    { key: 'consumption', label: 'استهلاك المواد' },
    { key: 'compare-pl', label: 'مقارنة الفترات' },
  ]

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">التقارير المالية والإدارية</h1>
          <p className="text-gray-500 text-sm mt-0.5">تحليل شامل للتكاليف والإيرادات والأداء</p>
        </div>
        <div className="flex items-center gap-2">
          {branches.length > 0 && (
            <select value={branch} onChange={e => setBranch(e.target.value)} className={inputCls}>
              <option value="">جميع الفروع</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <select value={month} onChange={e => setMonth(e.target.value)} className={inputCls}>
            {months.map(m => <option key={m} value={m}>{formatYearMonth(m)}</option>)}
          </select>
        </div>
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

      {tab === 'pl'        && <PLReport        brand={brand} month={month} branch={branch} />}
      {tab === 'fc'        && <FCReport         brand={brand} month={month} branch={branch} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'breakeven' && <BreakevenReport  brand={brand} month={month} branch={branch} />}
      {tab === 'purchases' && <PurchasesReport     brand={brand} month={month} />}
      {tab === 'sales'     && <SalesReport         brand={brand} month={month} branch={branch} />}
      {tab === 'menu'      && <MenuEngineering     brand={brand} month={month} branch={branch} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'variance'  && <VarianceReport      brand={brand} month={month} branch={branch} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'primecost' && <PrimeCostReport    brand={brand} month={month} branch={branch} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'pricing'   && <ReversePricingTool brand={brand} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'trends'    && <TrendsReport        brand={brand} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'branches'  && <BranchesReport      month={month} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'prices'    && <PriceHistoryReport  brand={brand} />}
      {tab === 'actual-fc' && <ActualFCReport       brand={brand} month={month} branch={branch} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'dine'        && <DineReport           brand={brand} fcLow={fcLow} fcHigh={fcHigh} />}
      {tab === 'discounts'   && <DiscountsReport      brand={brand} month={month} branch={branch} />}
      {tab === 'consumption' && <ConsumptionReport    brand={brand} month={month} />}
      {tab === 'compare-pl'  && <ComparePLReport      brand={brand} months={lastNMonths(12)} />}
    </div>
  )
}

// ── 1. P&L Report ─────────────────────────────────────────────────
function PLReport({ brand, month, branch = '' }: { brand: string; month: string; branch?: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const [{ data: sales }, { data: purchases }, { data: labor }, { data: overhead }, { data: brandRow }] = await Promise.all([
      wb((supabase.from('daily_sales') as any).select('revenue').eq('brand_id', brand).gte('sale_date', monthStart).lte('sale_date', monthEnd), branch),
      (supabase.from('purchases') as any).select('total_price').eq('brand_id', brand).gte('purchase_date', monthStart).lte('purchase_date', monthEnd),
      (supabase.from('labor_costs') as any).select('amount').eq('brand_id', brand).eq('month', month),
      (supabase.from('overhead_costs') as any).select('amount, category').eq('brand_id', brand).eq('month', month),
      (supabase.from('brands') as any).select('delivery_commission_pct').eq('id', brand).single(),
    ])

    const totalRevWithVat      = (sales || []).reduce((s: number, r: any) => s + r.revenue, 0)
    const revenue              = totalRevWithVat / VAT_RATE
    const materialCost         = (purchases || []).reduce((s: number, r: any) => s + r.total_price, 0)
    const laborCost            = (labor || []).reduce((s: number, r: any) => s + r.amount, 0)
    const overheadCost         = (overhead || []).reduce((s: number, r: any) => s + r.amount, 0)
    const commissionPct        = (brandRow as any)?.delivery_commission_pct ?? 0
    const deliveryCommission   = revenue * commissionPct / 100
    const totalCost            = materialCost + laborCost + overheadCost + deliveryCommission
    const grossProfit          = revenue - materialCost
    const netProfit            = revenue - totalCost
    const vat                  = totalRevWithVat - revenue

    const ovByCategory = (overhead || []).reduce((acc: any, r: any) => {
      acc[r.category] = (acc[r.category] || 0) + r.amount
      return acc
    }, {})

    setData({ revenue, totalRevWithVat, vat, materialCost, laborCost, overheadCost, deliveryCommission, commissionPct, totalCost, grossProfit, netProfit, ovByCategory })
    setLoading(false)
  }, [brand, month, branch])

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
    <div className="space-y-6" id="pl-report-content">
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
            <div className="flex gap-2">
              <button
                onClick={() => exportPLReport({ month, brand, revenue: r, materialCost: data.materialCost, laborCost: data.laborCost, overheadCost: data.overheadCost, rows: [] }).catch(console.error)}
                className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                ⬇ Excel
              </button>
              <button
                onClick={() => exportToPDF('pl-report-content', `تقرير-الأرباح-${month}`).catch(console.error)}
                className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                ⬇ PDF
              </button>
            </div>
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
                ...(data.deliveryCommission > 0 ? [{ label: `عمولة منصات التوصيل (${data.commissionPct}%)`, value: -data.deliveryCommission, color: 'text-red-500' }] : []),
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
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ر.س`]} />
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
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ر.س`]} />
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
function FCReport({ brand, month, branch = '', fcLow = 35, fcHigh = 45 }: { brand: string; month: string; branch?: string; fcLow?: number; fcHigh?: number }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const { data: sales } = await wb(
      (supabase.from('daily_sales') as any).select('product_sku, product_name, qty_sold, revenue')
        .eq('brand_id', brand).gte('sale_date', monthStart).lte('sale_date', monthEnd), branch)

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
      const revenueExVat = p.revenue / VAT_RATE
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
  }, [brand, month, branch])

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
        <KpiCard label="متوسط Food Cost %" value={`${avgFc.toFixed(1)}%`} color={avgFc <= fcLow ? 'text-green-700' : avgFc <= fcHigh ? 'text-amber-600' : 'text-red-700'} />
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
                        <span className={`font-mono text-xs font-semibold ${r.recipeFcPct <= fcLow ? 'text-green-600' : r.recipeFcPct <= fcHigh ? 'text-amber-600' : 'text-red-600'}`}>
                          {r.recipeFcPct.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-mono text-xs font-semibold ${r.actualFcPct <= fcLow ? 'text-green-600' : r.actualFcPct <= fcHigh ? 'text-amber-600' : 'text-red-600'}`}>
                        {r.actualFcPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.actualFcPct <= fcLow ? 'bg-green-50 text-green-700' : r.actualFcPct <= fcHigh ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {r.actualFcPct <= fcLow ? 'ممتاز' : r.actualFcPct <= fcHigh ? 'مقبول' : 'مرتفع'}
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
function BreakevenReport({ brand, month, branch = '' }: { brand: string; month: string; branch?: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const [{ data: sales }, { data: labor }, { data: overhead }] = await Promise.all([
      wb((supabase.from('daily_sales') as any).select('revenue, qty_sold, product_sku').eq('brand_id', brand).gte('sale_date', monthStart).lte('sale_date', monthEnd), branch),
      (supabase.from('labor_costs') as any).select('amount').eq('brand_id', brand).eq('month', month),
      (supabase.from('overhead_costs') as any).select('amount').eq('brand_id', brand).eq('month', month),
    ])

    const totalRevWithVat = (sales || []).reduce((s: number, r: any) => s + r.revenue, 0)
    const totalQty        = (sales || []).reduce((s: number, r: any) => s + r.qty_sold, 0)
    const revenue         = totalRevWithVat / VAT_RATE
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
    const daysInMonth        = parseInt(monthEnd.slice(-2), 10)
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
  }, [brand, month, branch])

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
              <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} ر.س`]} />
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
              <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ر.س`]} />
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
              <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ر.س`]} />
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
function SalesReport({ brand, month, branch = '' }: { brand: string; month: string; branch?: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start: monthStart, end: monthEnd } = monthRange(month)

    const { data: sales } = await wb(
      (supabase.from('daily_sales') as any).select('*').eq('brand_id', brand).gte('sale_date', monthStart).lte('sale_date', monthEnd), branch)

    if (!sales || sales.length === 0) { setData(null); setLoading(false); return }

    const rows = sales as any[]
    const totalRev  = rows.reduce((s: number, r: any) => s + r.revenue, 0)
    const totalQty  = rows.reduce((s: number, r: any) => s + r.qty_sold, 0)

    const byDate = rows.reduce((acc: any, r: any) => {
      if (!acc[r.sale_date]) acc[r.sale_date] = { date: r.sale_date, revenue: 0, qty: 0 }
      acc[r.sale_date].revenue += r.revenue / VAT_RATE
      acc[r.sale_date].qty     += r.qty_sold
      return acc
    }, {})

    const byProduct = rows.reduce((acc: any, r: any) => {
      const key = r.product_sku
      if (!acc[key]) acc[key] = { name: r.product_name, sku: key, revenue: 0, qty: 0 }
      acc[key].revenue += r.revenue / VAT_RATE
      acc[key].qty     += r.qty_sold
      return acc
    }, {})

    setData({
      totalRev: totalRev / VAT_RATE, totalRevWithVat: totalRev, totalQty,
      avgPerCover: totalQty > 0 ? (totalRev / VAT_RATE) / totalQty : 0,
      dateData: Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)),
      topByRevenue: Object.values(byProduct).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 10) as any[],
      topByQty:     Object.values(byProduct).sort((a: any, b: any) => b.qty - a.qty).slice(0, 10) as any[],
    })
    setLoading(false)
  }, [brand, month, branch])

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
            <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ر.س`]} />
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

// ── 6. Menu Engineering ────────────────────────────────────────────

type MenuCategory = 'star' | 'plowhorse' | 'puzzle' | 'dog'

interface MenuItem {
  sku: string
  name: string
  qty: number
  margin: number
  marginPct: number
  category: MenuCategory
}

const CATEGORY_CONFIG: Record<MenuCategory, { label: string; color: string; bg: string; desc: string }> = {
  star:       { label: 'نجم ⭐',   color: '#16a34a', bg: '#f0fdf4', desc: 'ربحية عالية + إقبال عالٍ' },
  plowhorse:  { label: 'حصان 🐎', color: '#d97706', bg: '#fffbeb', desc: 'ربحية منخفضة + إقبال عالٍ' },
  puzzle:     { label: 'لغز ❓',   color: '#2563eb', bg: '#eff6ff', desc: 'ربحية عالية + إقبال منخفض' },
  dog:        { label: 'كلب 🐕',   color: '#dc2626', bg: '#fef2f2', desc: 'ربحية منخفضة + إقبال منخفض' },
}

function MenuEngineering({ brand, month, branch = '', fcLow = 35, fcHigh = 45 }: { brand: string; month: string; branch?: string; fcLow?: number; fcHigh?: number }) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [avgQty, setAvgQty] = useState(0)
  const [avgMarginPct, setAvgMarginPct] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start, end } = monthRange(month)

    const [{ data: sales }, { data: recipes }] = await Promise.all([
      wb((supabase.from('daily_sales') as any).select('product_sku, product_name, qty_sold')
        .eq('brand_id', brand).gte('sale_date', start).lte('sale_date', end), branch),
      (supabase.from('recipes') as any)
        .select('sku, product_name, food_cost_pct, margin, sell_price, total_cost')
        .eq('brand_id', brand).eq('is_active', true),
    ])

    const saleMap = new Map<string, { name: string; qty: number }>()
    for (const s of (sales || []) as any[]) {
      const ex = saleMap.get(s.product_sku)
      if (ex) ex.qty += s.qty_sold
      else saleMap.set(s.product_sku, { name: s.product_name, qty: s.qty_sold })
    }

    const recipeMap = new Map<string, any>()
    for (const r of (recipes || []) as any[]) recipeMap.set(r.sku, r)

    const raw: { qty: number; margin: number; marginPct: number; sku: string; name: string }[] = []
    for (const [sku, sale] of saleMap) {
      const r = recipeMap.get(sku)
      if (!r) continue
      raw.push({ sku, name: sale.name, qty: sale.qty, margin: r.margin, marginPct: r.food_cost_pct })
    }

    if (!raw.length) { setItems([]); setLoading(false); return }

    const meanQty = raw.reduce((s, i) => s + i.qty, 0) / raw.length
    const meanPct = raw.reduce((s, i) => s + i.marginPct, 0) / raw.length
    setAvgQty(meanQty); setAvgMarginPct(meanPct)

    const classified: MenuItem[] = raw.map(i => {
      const hiQty = i.qty >= meanQty
      const hiMargin = i.marginPct <= meanPct // lower FC% = better margin
      const category: MenuCategory = hiQty && hiMargin ? 'star' : hiQty ? 'plowhorse' : hiMargin ? 'puzzle' : 'dog'
      return { ...i, category }
    })
    classified.sort((a, b) => b.qty - a.qty)
    setItems(classified); setLoading(false)
  }, [brand, month, branch])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">جارٍ التحليل...</div>
  if (!items.length) return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">لا توجد بيانات مبيعات أو وصفات نشطة لهذا الشهر</div>

  const counts = { star: 0, plowhorse: 0, puzzle: 0, dog: 0 }
  items.forEach(i => counts[i.category]++)

  const scatterData = items.map(i => ({ x: i.qty, y: i.marginPct, name: i.name, fill: CATEGORY_CONFIG[i.category].color }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">هندسة القائمة (Menu Engineering)</h2>
        <p className="text-xs text-gray-500 mt-0.5">تحليل {items.length} منتج · المتوسطات: {Math.round(avgQty)} مبيعة · FC% {avgMarginPct.toFixed(1)}%</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(CATEGORY_CONFIG) as MenuCategory[]).map(cat => (
          <div key={cat} className="rounded-xl border p-4 text-center" style={{ background: CATEGORY_CONFIG[cat].bg, borderColor: CATEGORY_CONFIG[cat].color + '40' }}>
            <div className="text-2xl font-bold" style={{ color: CATEGORY_CONFIG[cat].color }}>{counts[cat]}</div>
            <div className="text-sm font-semibold mt-1" style={{ color: CATEGORY_CONFIG[cat].color }}>{CATEGORY_CONFIG[cat].label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{CATEGORY_CONFIG[cat].desc}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-3">المحور الأفقي: الكمية المباعة · المحور الرأسي: FC% (أقل = أفضل)</div>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="x" name="المبيعات" type="number" tick={{ fontSize: 11 }} label={{ value: 'الكمية المباعة', position: 'insideBottom', offset: -10, fontSize: 11 }} />
            <YAxis dataKey="y" name="FC%" type="number" unit="%" tick={{ fontSize: 11 }} />
            <ZAxis range={[60, 60]} />
            <Tooltip content={({ payload }) => {
              if (!payload?.length) return null
              const d = payload[0]?.payload as any
              return (
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs shadow-lg">
                  <div className="font-semibold text-gray-900 mb-1">{d.name}</div>
                  <div className="text-gray-600">مبيعات: <span className="font-mono font-bold">{d.x}</span></div>
                  <div className="text-gray-600">FC%: <span className="font-mono font-bold">{d.y?.toFixed(1)}%</span></div>
                </div>
              )
            }} />
            <ReferenceLine x={avgQty} stroke="#94a3b8" strokeDasharray="4 4" />
            <ReferenceLine y={avgMarginPct} stroke="#94a3b8" strokeDasharray="4 4" />
            <Scatter data={scatterData} fill="#3b82f6">
              {scatterData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="text-right px-4 py-3 font-medium">المنتج</th>
              <th className="px-4 py-3 font-medium text-center">المبيعات</th>
              <th className="px-4 py-3 font-medium text-center">FC%</th>
              <th className="px-4 py-3 font-medium text-center">هامش</th>
              <th className="px-4 py-3 font-medium text-center">التصنيف</th>
              <th className="px-4 py-3 font-medium text-right">التوصية</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const cfg = CATEGORY_CONFIG[item.category]
              const rec = item.category === 'star' ? 'حافظ عليه وروّج له'
                : item.category === 'plowhorse' ? 'أعد التسعير أو قلّل التكلفة'
                : item.category === 'puzzle' ? 'روّج له أو غيّر مكانه في القائمة'
                : 'راجع إبقاءه في القائمة'
              return (
                <tr key={item.sku} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{item.sku}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono font-bold text-gray-900">{item.qty.toLocaleString()}</td>
                  <td className={`px-4 py-2.5 text-center font-mono text-sm font-semibold ${item.marginPct <= fcLow ? 'text-green-600' : item.marginPct <= fcHigh ? 'text-amber-600' : 'text-red-600'}`}>
                    {item.marginPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-700 text-xs">{item.margin.toFixed(2)} ر.س</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{rec}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 7. Variance Report: النظري vs الصافي vs POS ───────────────────

function VarianceReport({ brand, month, branch = '', fcLow = 35, fcHigh = 45 }: { brand: string; month: string; branch?: string; fcLow?: number; fcHigh?: number }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hasPosData, setHasPosData] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start, end } = monthRange(month)

    const { data: sales } = await wb(
      (supabase.from('daily_sales') as any).select('product_sku, product_name, qty_sold, revenue, cost_pos, discount_amount, return_amount')
        .eq('brand_id', brand).gte('sale_date', start).lte('sale_date', end), branch)

    if (!sales?.length) { setRows([]); setLoading(false); return }

    const map = new Map<string, { name: string; qty: number; revenue: number; costPos: number; discount: number; returnAmt: number }>()
    let anyPos = false
    for (const s of sales as any[]) {
      const ex = map.get(s.product_sku)
      if (ex) {
        ex.qty += s.qty_sold; ex.revenue += s.revenue
        ex.costPos += s.cost_pos ?? 0; ex.discount += s.discount_amount ?? 0
        ex.returnAmt += s.return_amount ?? 0
      } else {
        map.set(s.product_sku, { name: s.product_name, qty: s.qty_sold, revenue: s.revenue, costPos: s.cost_pos ?? 0, discount: s.discount_amount ?? 0, returnAmt: s.return_amount ?? 0 })
      }
      if ((s.cost_pos ?? 0) > 0) anyPos = true
    }
    setHasPosData(anyPos)

    const skus = [...map.keys()]
    const { data: recipes } = await (supabase.from('recipes') as any)
      .select('sku, total_cost, yield_portions').eq('brand_id', brand).eq('is_active', true).in('sku', skus)

    const recipeMap = new Map<string, number>()
    for (const r of (recipes || []) as any[]) recipeMap.set(r.sku, r.total_cost / Math.max(r.yield_portions, 1))

    const result = [...map.entries()].map(([sku, p]) => {
      const cpUnit = recipeMap.get(sku) ?? null
      const rev = p.revenue / VAT_RATE
      const netRev = Math.max(0, (p.revenue - p.discount - p.returnAmt) / VAT_RATE)
      const thCost = cpUnit != null ? cpUnit * p.qty : null
      return {
        sku, name: p.name, qty: p.qty,
        rev, netRev, discount: p.discount, returnAmt: p.returnAmt,
        costPos: p.costPos,
        fcTh:  thCost != null && rev > 0 ? (thCost / rev) * 100 : null,
        fcNet: thCost != null && netRev > 0 ? (thCost / netRev) * 100 : null,
        fcPos: p.costPos > 0 && rev > 0 ? (p.costPos / rev) * 100 : null,
      }
    }).sort((a, b) => b.rev - a.rev)

    setRows(result); setLoading(false)
  }, [brand, month, branch])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!rows.length) return <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">لا توجد بيانات مبيعات لهذا الشهر</div>

  const totalRev    = rows.reduce((s, r) => s + r.rev, 0)
  const totalNetRev = rows.reduce((s, r) => s + r.netRev, 0)
  const totalThCost = rows.reduce((s, r) => s + (r.fcTh != null ? (r.fcTh / 100) * r.rev : 0), 0)
  const totalPos    = rows.reduce((s, r) => s + r.costPos, 0)
  const totalDisc   = rows.reduce((s, r) => s + r.discount, 0)
  const totalRet    = rows.reduce((s, r) => s + r.returnAmt, 0)

  const avgTh  = totalRev > 0 ? (totalThCost / totalRev) * 100 : 0
  const avgNet = totalNetRev > 0 ? (totalThCost / totalNetRev) * 100 : 0
  const avgPos = hasPosData && totalRev > 0 ? (totalPos / totalRev) * 100 : null

  const fc = (v: number | null) => v == null ? 'text-gray-300' : v <= fcLow ? 'text-green-600' : v <= fcHigh ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">مقارنة FC% — النظري vs الصافي vs POS</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          الخصومات: {totalDisc.toFixed(0)} ر.س · المرتجعات: {totalRet.toFixed(0)} ر.س
          {!hasPosData && ' · تكلفة POS غير متوفرة (تحتاج استيراد Foodics)'}
        </p>
      </div>

      <div className={`grid gap-4 ${hasPosData ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs text-gray-500 mb-1">FC% نظري</div>
          <div className={`text-2xl font-bold font-mono ${fc(avgTh)}`}>{avgTh.toFixed(1)}%</div>
          <div className="text-xs text-gray-400 mt-1">تكلفة الوصفة ÷ الإيراد الإجمالي</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs text-gray-500 mb-1">FC% صافي</div>
          <div className={`text-2xl font-bold font-mono ${fc(avgNet)}`}>{avgNet.toFixed(1)}%</div>
          <div className="text-xs text-gray-400 mt-1">بعد خصم الخصومات والمرتجعات</div>
        </div>
        {hasPosData && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-xs text-gray-500 mb-1">FC% من POS</div>
            <div className={`text-2xl font-bold font-mono ${fc(avgPos)}`}>{avgPos?.toFixed(1)}%</div>
            <div className="text-xs text-gray-400 mt-1">تكلفة Foodics المباشرة</div>
          </div>
        )}
      </div>

      {hasPosData && avgPos != null && (
        <div className={`rounded-xl px-4 py-3 text-sm border flex items-center gap-2 ${Math.abs(avgPos - avgTh) > 3 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          <span>{Math.abs(avgPos - avgTh) > 3 ? '⚠️' : '✅'}</span>
          <span>الفرق بين FC% النظري والـ POS: <strong>{(avgPos - avgTh).toFixed(1)}%</strong>
            {Math.abs(avgPos - avgTh) > 3 ? ' — فجوة تستحق المراجعة (هدر غير مسجّل أو خطأ في التكاليف)' : ' — الفرق ضمن الحدود المقبولة'}
          </span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-right px-4 py-3 font-medium">المنتج</th>
                <th className="px-4 py-3 font-medium text-center">الكمية</th>
                <th className="px-4 py-3 font-medium text-center">الإيراد</th>
                <th className="px-4 py-3 font-medium text-center bg-blue-50 text-blue-700">FC% نظري</th>
                <th className="px-4 py-3 font-medium text-center bg-amber-50 text-amber-700">FC% صافي</th>
                {hasPosData && <th className="px-4 py-3 font-medium text-center bg-green-50 text-green-700">FC% POS</th>}
                {hasPosData && <th className="px-4 py-3 font-medium text-center">الفرق</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diff = r.fcPos != null && r.fcTh != null ? r.fcPos - r.fcTh : null
                return (
                  <tr key={r.sku} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{r.sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-gray-700 text-xs">{r.qty.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-gray-700 text-xs">{r.rev.toFixed(0)}</td>
                    <td className={`px-4 py-2.5 text-center font-mono font-semibold ${fc(r.fcTh)}`}>{r.fcTh != null ? `${r.fcTh.toFixed(1)}%` : <span className="text-gray-300 text-xs">لا وصفة</span>}</td>
                    <td className={`px-4 py-2.5 text-center font-mono font-semibold ${fc(r.fcNet)}`}>{r.fcNet != null ? `${r.fcNet.toFixed(1)}%` : '—'}</td>
                    {hasPosData && <td className={`px-4 py-2.5 text-center font-mono font-semibold ${fc(r.fcPos)}`}>{r.fcPos != null ? `${r.fcPos.toFixed(1)}%` : <span className="text-gray-300 text-xs">—</span>}</td>}
                    {hasPosData && (
                      <td className={`px-4 py-2.5 text-center font-mono font-semibold text-sm ${diff == null ? 'text-gray-300' : Math.abs(diff) > 3 ? (diff > 0 ? 'text-red-600' : 'text-green-600') : 'text-gray-500'}`}>
                        {diff != null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%` : '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── 8. Prime Cost Report ──────────────────────────────────────────

function PrimeCostReport({ brand, month, branch = '', fcLow = 35, fcHigh = 45 }: { brand: string; month: string; branch?: string; fcLow?: number; fcHigh?: number }) {
  const [rows, setRows] = useState<any[]>([])
  const [summary, setSummary] = useState<{ laborPct: number; overheadPct: number; totalRev: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { start, end } = monthRange(month)

    const [{ data: sales }, { data: labor }, { data: overhead }] = await Promise.all([
      wb((supabase.from('daily_sales') as any).select('product_sku, product_name, qty_sold, revenue').eq('brand_id', brand).gte('sale_date', start).lte('sale_date', end), branch),
      (supabase.from('labor_costs') as any).select('amount').eq('brand_id', brand).eq('month', month),
      (supabase.from('overhead_costs') as any).select('amount').eq('brand_id', brand).eq('month', month),
    ])

    if (!sales?.length) { setRows([]); setLoading(false); return }

    const map = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const s of sales as any[]) {
      const ex = map.get(s.product_sku)
      if (ex) { ex.qty += s.qty_sold; ex.revenue += s.revenue }
      else map.set(s.product_sku, { name: s.product_name, qty: s.qty_sold, revenue: s.revenue })
    }

    const totalRevExVat = [...map.values()].reduce((s, p) => s + p.revenue / VAT_RATE, 0)
    const totalLabor    = (labor    || []).reduce((s: number, r: any) => s + r.amount, 0)
    const totalOverhead = (overhead || []).reduce((s: number, r: any) => s + r.amount, 0)
    const laborPct    = totalRevExVat > 0 ? (totalLabor    / totalRevExVat) * 100 : 0
    const overheadPct = totalRevExVat > 0 ? (totalOverhead / totalRevExVat) * 100 : 0
    setSummary({ laborPct, overheadPct, totalRev: totalRevExVat })

    const skus = [...map.keys()]
    const { data: recipes } = await (supabase.from('recipes') as any)
      .select('sku, total_cost, yield_portions, food_cost_pct, sell_price')
      .eq('brand_id', brand).eq('is_active', true).in('sku', skus)

    const recipeMap = new Map<string, any>()
    for (const r of (recipes || []) as any[]) recipeMap.set(r.sku, r)

    const result = [...map.entries()].map(([sku, p]) => {
      const rec = recipeMap.get(sku)
      if (!rec) return null
      const revExVat = p.revenue / VAT_RATE
      const fcPct = rec.food_cost_pct as number
      const primeCostPct = fcPct + laborPct + overheadPct
      const sellExVat = (rec.sell_price as number) / VAT_RATE
      const fcPerUnit = (rec.total_cost as number) / Math.max(rec.yield_portions, 1)
      const opMargin = sellExVat - fcPerUnit - (laborPct / 100) * sellExVat - (overheadPct / 100) * sellExVat
      return { sku, name: p.name, qty: p.qty, revExVat, fcPct, laborPct, overheadPct, primeCostPct, opMarginPct: 100 - primeCostPct, opMargin }
    }).filter(Boolean).sort((a: any, b: any) => a.opMarginPct - b.opMarginPct)

    setRows(result as any[]); setLoading(false)
  }, [brand, month, branch])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!rows.length || !summary) return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
      لا توجد بيانات. تأكد من إدخال تكاليف العمالة والتكاليف الثابتة في صفحة التكاليف لهذا الشهر.
    </div>
  )

  const avgFc       = rows.reduce((s, r) => s + r.fcPct * r.revExVat, 0) / Math.max(summary.totalRev, 1)
  const avgOpMargin = 100 - avgFc - summary.laborPct - summary.overheadPct
  const clr = (v: number) => v >= 20 ? 'text-green-600' : v >= 10 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">التكلفة الإجمالية (Prime Cost)</h2>
        <p className="text-xs text-gray-500 mt-0.5">توزيع تكاليف العمالة والتشغيل على كل منتج بنسبة إيراده</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Food Cost', val: avgFc, color: 'blue' },
          { label: 'العمالة', val: summary.laborPct, color: 'purple' },
          { label: 'التكاليف الثابتة', val: summary.overheadPct, color: 'amber' },
        ].map(({ label, val, color }) => (
          <div key={label} className={`bg-${color}-50 border border-${color}-100 rounded-xl p-4 text-center`}>
            <div className={`text-xs text-${color}-600 mb-1`}>{label}</div>
            <div className={`text-2xl font-bold font-mono text-${color}-700`}>{val.toFixed(1)}%</div>
          </div>
        ))}
        <div className={`border rounded-xl p-4 text-center ${avgOpMargin >= 20 ? 'bg-green-50 border-green-100' : avgOpMargin >= 10 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
          <div className={`text-xs mb-1 ${clr(avgOpMargin)}`}>هامش التشغيل</div>
          <div className={`text-2xl font-bold font-mono ${clr(avgOpMargin)}`}>{avgOpMargin.toFixed(1)}%</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-3">تركيب التكلفة الإجمالية</div>
        <div className="flex h-8 rounded-lg overflow-hidden gap-px">
          <div className="flex items-center justify-center text-xs text-white font-medium" style={{ width: `${avgFc}%`, background: '#3b82f6' }}>FC {avgFc.toFixed(0)}%</div>
          <div className="flex items-center justify-center text-xs text-white font-medium" style={{ width: `${summary.laborPct}%`, background: '#8b5cf6' }}>عمالة {summary.laborPct.toFixed(0)}%</div>
          <div className="flex items-center justify-center text-xs text-white font-medium" style={{ width: `${summary.overheadPct}%`, background: '#f59e0b' }}>ثابتة {summary.overheadPct.toFixed(0)}%</div>
          <div className="flex items-center justify-center text-xs text-white font-medium flex-1" style={{ background: '#10b981' }}>هامش {avgOpMargin.toFixed(0)}%</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-right px-4 py-3 font-medium">المنتج</th>
                <th className="px-4 py-3 font-medium text-center">الكمية</th>
                <th className="px-4 py-3 font-medium text-center bg-blue-50 text-blue-700">FC%</th>
                <th className="px-4 py-3 font-medium text-center bg-purple-50 text-purple-700">عمالة%</th>
                <th className="px-4 py-3 font-medium text-center bg-amber-50 text-amber-700">ثابتة%</th>
                <th className="px-4 py-3 font-medium text-center">Prime Cost%</th>
                <th className="px-4 py-3 font-medium text-center">هامش التشغيل%</th>
                <th className="px-4 py-3 font-medium text-center">هامش / وحدة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.sku} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{r.sku}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-700 text-xs">{r.qty.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-sm text-blue-600 font-semibold">{r.fcPct.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-center font-mono text-sm text-purple-600">{r.laborPct.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-center font-mono text-sm text-amber-600">{r.overheadPct.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-center font-mono text-sm font-semibold text-gray-700">{r.primeCostPct.toFixed(1)}%</td>
                  <td className={`px-4 py-2.5 text-center font-mono text-sm font-bold ${clr(r.opMarginPct)}`}>{r.opMarginPct.toFixed(1)}%</td>
                  <td className={`px-4 py-2.5 text-center font-mono text-xs ${clr(r.opMarginPct)}`}>{r.opMargin.toFixed(2)} ر.س</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400">* العمالة والتكاليف الثابتة موزّعة بنسبة إيراد كل منتج. مرتّب من الأقل هامشاً للأعلى.</p>
    </div>
  )
}

// ── 9. Reverse Pricing Tool ───────────────────────────────────────

function ReversePricingTool({ brand, fcLow = 35, fcHigh = 45 }: { brand: string; fcLow?: number; fcHigh?: number }) {
  const [recipes, setRecipes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSku, setSelectedSku] = useState('')
  const [targetFc, setTargetFc] = useState(fcLow)
  const [applying, setApplying] = useState(false)
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await (supabase.from('recipes') as any)
        .select('sku, product_name, total_cost, yield_portions, sell_price, food_cost_pct, app_price, is_active')
        .eq('brand_id', brand).eq('is_active', true).order('product_name')
      setRecipes(data || [])
      if (data?.length) setSelectedSku(data[0].sku)
      setLoading(false)
    }
    load()
  }, [brand])

  const selected = recipes.find(r => r.sku === selectedSku)
  const costPerPortion = selected ? selected.total_cost / Math.max(selected.yield_portions, 1) : 0

  async function applyPrice() {
    if (!selected || suggestedPrice <= 0) return
    setApplying(true); setApplyMsg(null)
    const supabase = createClient()
    const newSellWithVat = Math.round(suggestedPriceWithVat * 100) / 100
    const { error } = await (supabase.from('products') as any)
      .update({ price: newSellWithVat })
      .eq('brand_id', brand).eq('sku', selected.sku)
    if (error) { setApplyMsg({ ok: false, text: error.message }); setApplying(false); return }
    setApplyMsg({ ok: true, text: `تم تحديث سعر "${selected.product_name}" إلى ${newSellWithVat.toFixed(2)} ر.س ✓` })
    setApplying(false)
  }
  const suggestedPrice = targetFc > 0 ? costPerPortion / (targetFc / 100) : 0
  const suggestedPriceWithVat = suggestedPrice * VAT_RATE
  const currentSellExVat = selected ? selected.sell_price / VAT_RATE : 0
  const priceDiff = suggestedPrice - currentSellExVat

  const benchmarks = [25, 30, 35, 40, 45]

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!recipes.length) return <div className="py-16 text-center text-gray-400">لا توجد وصفات نشطة</div>

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">أداة التسعير العكسي</h2>
        <p className="text-xs text-gray-500 mt-0.5">أدخل نسبة Food Cost المستهدفة واحصل على سعر البيع المقترح</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">المنتج</label>
              <select value={selectedSku} onChange={e => setSelectedSku(e.target.value)} className={`${inputCls} w-full`}>
                {recipes.map(r => <option key={r.sku} value={r.sku}>{r.product_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">نسبة Food Cost المستهدفة (%)</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={10} max={60} step={0.5}
                  value={targetFc} onChange={e => setTargetFc(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number" min={1} max={100} step={0.5}
                  value={targetFc} onChange={e => setTargetFc(Number(e.target.value))}
                  className={`${inputCls} w-20 text-center`}
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          </div>

          {selected && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">تكلفة الوصفة/وحدة</span>
                  <span className="font-mono font-semibold">{costPerPortion.toFixed(3)} ر.س</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">FC% الحالي</span>
                  <span className={`font-mono font-semibold ${selected.food_cost_pct <= fcLow ? 'text-green-600' : selected.food_cost_pct <= fcHigh ? 'text-amber-600' : 'text-red-600'}`}>
                    {selected.food_cost_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">السعر الحالي (قبل VAT)</span>
                  <span className="font-mono text-gray-700">{currentSellExVat.toFixed(2)} ر.س</span>
                </div>
                <hr className="border-gray-200" />
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-800">السعر المقترح (قبل VAT)</span>
                  <span className="font-mono font-bold text-blue-700 text-lg">{suggestedPrice.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-xs">السعر المقترح (شامل VAT 15%)</span>
                  <span className="font-mono font-semibold text-blue-600">{suggestedPriceWithVat.toFixed(2)} ر.س</span>
                </div>
                <div className={`flex justify-between text-xs mt-1 pt-1 border-t border-gray-100 ${priceDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>الفرق عن السعر الحالي</span>
                  <span className="font-mono font-semibold">{priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(2)} ر.س</span>
                </div>
                <button onClick={applyPrice} disabled={applying || suggestedPrice <= 0}
                  className="mt-3 w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors">
                  {applying ? 'جارٍ التطبيق...' : `تطبيق السعر ${suggestedPriceWithVat.toFixed(2)} ر.س على المنتج`}
                </button>
                {applyMsg && (
                  <div className={`text-xs mt-2 px-2 py-1.5 rounded-lg ${applyMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {applyMsg.text}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <span className="font-semibold text-gray-900 text-sm">جدول السعر المقترح عند نسب FC% مختلفة</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <th className="text-center px-4 py-2.5 font-medium">FC% المستهدف</th>
                <th className="text-center px-4 py-2.5 font-medium">سعر البيع (قبل VAT)</th>
                <th className="text-center px-4 py-2.5 font-medium">سعر البيع (شامل VAT)</th>
                <th className="text-center px-4 py-2.5 font-medium">الفرق عن الحالي</th>
                <th className="text-center px-4 py-2.5 font-medium">هامش الوحدة</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map(fc => {
                const price = costPerPortion / (fc / 100)
                const priceVat = price * VAT_RATE
                const diff = price - currentSellExVat
                const margin = price - costPerPortion
                const isTarget = Math.abs(fc - targetFc) < 0.01
                return (
                  <tr key={fc} className={`border-b border-gray-100 last:border-0 ${isTarget ? 'bg-blue-50' : ''}`}>
                    <td className={`px-4 py-2.5 text-center font-mono font-bold ${fc <= fcLow ? 'text-green-600' : fc <= fcHigh ? 'text-amber-600' : 'text-red-600'}`}>
                      {fc}% {isTarget && <span className="text-xs text-blue-600 ml-1">← الهدف</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-semibold text-gray-900">{price.toFixed(2)} ر.س</td>
                    <td className="px-4 py-2.5 text-center font-mono text-gray-600">{priceVat.toFixed(2)} ر.س</td>
                    <td className={`px-4 py-2.5 text-center font-mono text-sm font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)} ر.س
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-gray-600">{margin.toFixed(2)} ر.س</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 10. Trends Report ─────────────────────────────────────────────

function TrendsReport({ brand, fcLow = 35, fcHigh = 45 }: { brand: string; fcLow?: number; fcHigh?: number }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nMonths, setNMonths] = useState(6)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const months = lastNMonths(nMonths)
      const rangeStart = monthRange(months[months.length - 1]).start
      const rangeEnd   = monthRange(months[0]).end

      // 4 queries total instead of nMonths × 4
      const [{ data: sales }, { data: purchases }, { data: labor }, { data: overhead }] = await Promise.all([
        (supabase.from('daily_sales') as any).select('sale_date, revenue').eq('brand_id', brand).gte('sale_date', rangeStart).lte('sale_date', rangeEnd).limit(10000),
        (supabase.from('purchases') as any).select('purchase_date, total_price').eq('brand_id', brand).gte('purchase_date', rangeStart).lte('purchase_date', rangeEnd).limit(10000),
        (supabase.from('labor_costs') as any).select('month, amount').eq('brand_id', brand).in('month', months),
        (supabase.from('overhead_costs') as any).select('month, amount').eq('brand_id', brand).in('month', months),
      ])
      if (cancelled) return

      // Group by month key (YYYY-MM)
      const revMap  = new Map<string, number>()
      const matMap  = new Map<string, number>()
      const labMap  = new Map<string, number>()
      const ovhMap  = new Map<string, number>()

      for (const r of (sales || []) as any[])
        revMap.set(r.sale_date.slice(0, 7), (revMap.get(r.sale_date.slice(0, 7)) ?? 0) + r.revenue)
      for (const r of (purchases || []) as any[])
        matMap.set(r.purchase_date.slice(0, 7), (matMap.get(r.purchase_date.slice(0, 7)) ?? 0) + r.total_price)
      for (const r of (labor || []) as any[])
        labMap.set(r.month, (labMap.get(r.month) ?? 0) + r.amount)
      for (const r of (overhead || []) as any[])
        ovhMap.set(r.month, (ovhMap.get(r.month) ?? 0) + r.amount)

      const results = months.map(m => {
        const rev = (revMap.get(m) ?? 0) / VAT_RATE
        const mat = matMap.get(m) ?? 0
        const lab = labMap.get(m) ?? 0
        const ovh = ovhMap.get(m) ?? 0
        return {
          month: formatYearMonth(m), rev, mat, lab, ovh,
          fcPct:       rev > 0 ? (mat / rev) * 100 : 0,
          laborPct:    rev > 0 ? (lab / rev) * 100 : 0,
          overheadPct: rev > 0 ? (ovh / rev) * 100 : 0,
          netMargin:   rev > 0 ? ((rev - mat - lab - ovh) / rev) * 100 : 0,
        }
      }).reverse()

      setRows(results)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [brand, nMonths])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>

  const hasData = rows.some(r => r.rev > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">تقارير الاتجاه — آخر {nMonths} أشهر</h2>
          <p className="text-xs text-gray-500 mt-0.5">مقارنة FC% والإيراد وهامش الربح الصافي عبر الزمن</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[3, 6, 12].map(n => (
            <button key={n} onClick={() => setNMonths(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${nMonths === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {n} أشهر
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">لا توجد بيانات كافية للعرض</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">الإيراد الشهري (قبل VAT) — ر.س</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={rows} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ر.س`]} />
                  <Bar dataKey="rev" fill="#3b82f6" radius={[4, 4, 0, 0]} name="الإيراد" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">اتجاه النسب الشهرية (%)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  <Line type="monotone" dataKey="fcPct"       name="FC%"        stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="laborPct"    name="عمالة%"     stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="overheadPct" name="تشغيل%"     stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="netMargin"   name="هامش صافي%" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                    <th className="text-right px-4 py-3 font-medium">الشهر</th>
                    <th className="text-left px-4 py-3 font-medium">الإيراد</th>
                    <th className="text-left px-4 py-3 font-medium">المشتريات</th>
                    <th className="text-center px-4 py-3 font-medium text-red-600">FC%</th>
                    <th className="text-center px-4 py-3 font-medium text-purple-600">عمالة%</th>
                    <th className="text-center px-4 py-3 font-medium text-amber-600">تشغيل%</th>
                    <th className="text-center px-4 py-3 font-medium text-green-600">هامش صافي%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.month}</td>
                      <td className="px-4 py-2.5 font-mono text-blue-700">{r.rev > 0 ? `${r.rev.toFixed(0)} ر.س` : '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-red-600">{r.mat > 0 ? `${r.mat.toFixed(0)} ر.س` : '—'}</td>
                      <td className={`px-4 py-2.5 text-center font-mono font-semibold ${r.fcPct <= fcLow ? 'text-green-600' : r.fcPct <= fcHigh ? 'text-amber-600' : r.fcPct > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {r.fcPct > 0 ? `${r.fcPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-purple-600">{r.laborPct > 0 ? `${r.laborPct.toFixed(1)}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-amber-600">{r.overheadPct > 0 ? `${r.overheadPct.toFixed(1)}%` : '—'}</td>
                      <td className={`px-4 py-2.5 text-center font-mono font-semibold ${r.netMargin >= 20 ? 'text-green-600' : r.netMargin >= 10 ? 'text-amber-600' : r.netMargin > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {r.rev > 0 ? `${r.netMargin.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── 11. Branches Comparison Report ────────────────────────────────

function BranchesReport({ month, fcLow = 35, fcHigh = 45 }: { month: string; fcLow?: number; fcHigh?: number }) {
  const { profile } = useUserStore()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  if (profile?.brand_access !== 'all') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
        <p className="text-amber-800 font-semibold text-sm">هذه الميزة تتطلب صلاحية الوصول لكلا الفرعين</p>
        <p className="text-amber-600 text-xs mt-1">تواصل مع مدير النظام للحصول على صلاحية "الكل"</p>
      </div>
    )
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const { start, end } = monthRange(month)

      const brands = ['ti', 'bb'] as const
      const [ti, bb] = await Promise.all(brands.map(async (b) => {
        const [{ data: sales }, { data: purchases }, { data: labor }, { data: overhead }] = await Promise.all([
          (supabase.from('daily_sales') as any).select('revenue').eq('brand_id', b).gte('sale_date', start).lte('sale_date', end),
          (supabase.from('purchases') as any).select('total_price').eq('brand_id', b).gte('purchase_date', start).lte('purchase_date', end),
          (supabase.from('labor_costs') as any).select('amount').eq('brand_id', b).eq('month', month),
          (supabase.from('overhead_costs') as any).select('amount').eq('brand_id', b).eq('month', month),
        ])
        const rev = (sales     || []).reduce((s: number, r: any) => s + r.revenue, 0) / VAT_RATE
        const mat = (purchases || []).reduce((s: number, r: any) => s + r.total_price, 0)
        const lab = (labor     || []).reduce((s: number, r: any) => s + r.amount, 0)
        const ovh = (overhead  || []).reduce((s: number, r: any) => s + r.amount, 0)
        return {
          rev, mat, lab, ovh,
          fcPct:      rev > 0 ? (mat / rev) * 100 : 0,
          laborPct:   rev > 0 ? (lab / rev) * 100 : 0,
          ovhPct:     rev > 0 ? (ovh / rev) * 100 : 0,
          netMargin:  rev > 0 ? ((rev - mat - lab - ovh) / rev) * 100 : 0,
          netProfit:  rev - mat - lab - ovh,
        }
      }))

      const combined = {
        rev: ti.rev + bb.rev,
        mat: ti.mat + bb.mat,
        lab: ti.lab + bb.lab,
        ovh: ti.ovh + bb.ovh,
        netProfit: ti.netProfit + bb.netProfit,
      }
      const cRev = combined.rev
      setData({
        ti, bb,
        combined: {
          ...combined,
          fcPct:     cRev > 0 ? (combined.mat / cRev) * 100 : 0,
          laborPct:  cRev > 0 ? (combined.lab / cRev) * 100 : 0,
          ovhPct:    cRev > 0 ? (combined.ovh / cRev) * 100 : 0,
          netMargin: cRev > 0 ? (combined.netProfit / cRev) * 100 : 0,
        },
      })
      setLoading(false)
    }
    load()
  }, [month])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!data) return null

  const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ر.س'
  const fmtPct = (v: number) => v > 0 ? `${v.toFixed(1)}%` : '—'
  const fcColor = (v: number) => v <= fcLow ? 'text-green-600' : v <= fcHigh ? 'text-amber-600' : v > 0 ? 'text-red-600' : 'text-gray-300'
  const marginColor = (v: number) => v >= 20 ? 'text-green-600' : v >= 10 ? 'text-amber-600' : v > 0 ? 'text-red-600' : 'text-gray-300'

  const cols = [
    { key: 'ti',       label: 'Three In',   color: '#3b82f6' },
    { key: 'bb',       label: 'باب البلد',  color: '#10b981' },
    { key: 'combined', label: 'الإجمالي',  color: '#8b5cf6' },
  ]

  const chartData = [
    { name: 'الإيراد',    ti: data.ti.rev,    bb: data.bb.rev    },
    { name: 'المشتريات',  ti: data.ti.mat,    bb: data.bb.mat    },
    { name: 'العمالة',    ti: data.ti.lab,    bb: data.bb.lab    },
    { name: 'التشغيل',   ti: data.ti.ovh,    bb: data.bb.ovh    },
    { name: 'صافي الربح', ti: Math.max(0, data.ti.netProfit), bb: Math.max(0, data.bb.netProfit) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">مقارنة الفروع — {formatYearMonth(month)}</h2>
        <p className="text-xs text-gray-500 mt-0.5">أداء Three In وباب البلد جنباً إلى جنب</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cols.map(({ key, label, color }) => {
          const d = data[key as keyof typeof data] as any
          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
                <span className="font-semibold text-gray-900 text-sm">{label}</span>
              </div>
              <div className="p-4 space-y-2.5 text-sm">
                {[
                  { label: 'الإيراد',          value: fmt(d.rev),            cls: 'text-blue-700 font-bold' },
                  { label: 'المشتريات',         value: fmt(d.mat),            cls: 'text-red-600' },
                  { label: 'FC%',               value: fmtPct(d.fcPct),       cls: fcColor(d.fcPct) + ' font-semibold' },
                  { label: 'عمالة%',            value: fmtPct(d.laborPct),    cls: 'text-purple-600' },
                  { label: 'تشغيل%',           value: fmtPct(d.ovhPct),      cls: 'text-amber-600' },
                  { label: 'هامش صافي%',        value: fmtPct(d.netMargin),   cls: marginColor(d.netMargin) + ' font-bold' },
                  { label: 'صافي الربح',        value: fmt(d.netProfit),      cls: d.netProfit >= 0 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-gray-500">{row.label}</span>
                    <span className={`font-mono ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-500 mb-3">مقارنة التكاليف والإيراد بين الفرعين</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ر.س`]} />
            <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="ti" name="Three In" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="bb" name="باب البلد" fill="#10b981" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── 12. Price History Report ──────────────────────────────────────

function PriceHistoryReport({ brand }: { brand: string }) {
  const [rows, setRows]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [days, setDays]           = useState(90)
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [search, setSearch]       = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const { data } = await (supabase.from('price_history') as any)
        .select('id, sku, item_name, item_type, old_price, new_price, changed_at')
        .eq('brand_id', brand)
        .gte('changed_at', since)
        .order('changed_at', { ascending: false })
        .limit(2000)
      setRows((data || []) as any[])
      setLoading(false)
    }
    load()
  }, [brand, days])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!rows.length) return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
      لا توجد تغييرات أسعار في آخر {days} يوم
    </div>
  )

  // تجميع حسب SKU
  const itemMap = new Map<string, { name: string; type: string; changes: { date: string; old: number; new: number; pct: number }[] }>()
  for (const r of rows as any[]) {
    if (!itemMap.has(r.sku)) itemMap.set(r.sku, { name: r.item_name, type: r.item_type, changes: [] })
    const pct = r.old_price > 0 ? ((r.new_price - r.old_price) / r.old_price) * 100 : 0
    itemMap.get(r.sku)!.changes.push({ date: r.changed_at.slice(0, 10), old: r.old_price, new: r.new_price, pct })
  }

  // أكثر 10 مواد تقلباً (أعلى فارق % إجمالي)
  const volatile = [...itemMap.entries()]
    .map(([sku, info]) => {
      const totalPct = info.changes.reduce((s, c) => s + Math.abs(c.pct), 0)
      const latest = info.changes[0]
      const oldest = info.changes[info.changes.length - 1]
      const netPct = oldest.old > 0 ? ((latest.new - oldest.old) / oldest.old) * 100 : 0
      return { sku, name: info.name, type: info.type, changes: info.changes.length, totalPct, netPct, latest }
    })
    .sort((a, b) => b.totalPct - a.totalPct)
    .slice(0, 10)

  // بيانات الخط للصنف المختار
  const selItem = selectedSku ? itemMap.get(selectedSku) : null
  const chartData = selItem
    ? [...selItem.changes].reverse().map(c => ({ date: c.date, price: c.new }))
    : []

  const filteredRows = (search
    ? rows.filter((r: any) => r.item_name.toLowerCase().includes(search.toLowerCase()))
    : rows) as any[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">تاريخ تغيّرات الأسعار</h2>
          <p className="text-xs text-gray-500 mt-0.5">{rows.length} تغيير · {itemMap.size} مادة متأثرة</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[30, 90, 180].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${days === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              آخر {d} يوم
            </button>
          ))}
        </div>
      </div>

      {/* أكثر 10 مواد تقلباً */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="font-semibold text-sm text-gray-900">أكثر 10 مواد تقلباً في السعر</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
              <th className="text-right px-4 py-2.5 font-medium">المادة</th>
              <th className="text-center px-4 py-2.5 font-medium">عدد التغييرات</th>
              <th className="text-center px-4 py-2.5 font-medium">السعر الحالي</th>
              <th className="text-center px-4 py-2.5 font-medium">التغيّر الإجمالي</th>
              <th className="text-center px-4 py-2.5 font-medium">مخطط</th>
            </tr>
          </thead>
          <tbody>
            {volatile.map((v, i) => (
              <tr key={v.sku} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-blue-50/30 cursor-pointer`}
                onClick={() => setSelectedSku(prev => prev === v.sku ? null : v.sku)}>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-900 text-sm">{v.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono text-gray-400">{v.sku}</span>
                    <span className={`text-[10px] px-1 rounded ${v.type === 'ingredient' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                      {v.type === 'ingredient' ? 'خام' : 'باتش'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center font-mono text-gray-600">{v.changes}</td>
                <td className="px-4 py-2.5 text-center font-mono font-semibold text-gray-900">
                  {v.latest.new.toFixed(3)} ر.س
                </td>
                <td className={`px-4 py-2.5 text-center font-mono font-semibold ${v.netPct > 0 ? 'text-red-600' : v.netPct < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {v.netPct !== 0 ? `${v.netPct >= 0 ? '+' : ''}${v.netPct.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="text-xs text-blue-500">{selectedSku === v.sku ? '▲ مخفي' : '▼ عرض'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* خط الأسعار للصنف المختار */}
      {selItem && chartData.length > 1 && (
        <div className="bg-white border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-600 mb-3">
            تاريخ أسعار: <span className="text-blue-700 font-semibold">{selItem.name}</span>
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(3)} ر.س`, 'السعر']} />
              <Line type="stepAfter" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="السعر" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* سجل التغييرات */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <span className="font-semibold text-sm text-gray-900">سجل كل التغييرات</span>
          <input type="text" placeholder="بحث بالمادة..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1 text-xs focus:outline-none focus:border-blue-500 bg-white w-40" />
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="text-right px-4 py-2.5 font-medium">المادة</th>
                <th className="text-center px-4 py-2.5 font-medium">السعر القديم</th>
                <th className="text-center px-4 py-2.5 font-medium">السعر الجديد</th>
                <th className="text-center px-4 py-2.5 font-medium">التغيّر</th>
                <th className="text-right px-4 py-2.5 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 100).map((r: any, i: number) => {
                const pct = r.old_price > 0 ? ((r.new_price - r.old_price) / r.old_price) * 100 : 0
                return (
                  <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-800 text-xs">{r.item_name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{r.sku}</div>
                    </td>
                    <td className="px-4 py-2 text-center font-mono text-gray-500 text-xs">{r.old_price.toFixed(3)}</td>
                    <td className="px-4 py-2 text-center font-mono font-semibold text-gray-900 text-xs">{r.new_price.toFixed(3)}</td>
                    <td className={`px-4 py-2 text-center font-mono text-xs font-semibold ${pct > 5 ? 'text-red-600' : pct < -5 ? 'text-green-600' : 'text-gray-500'}`}>
                      {pct !== 0 ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400 font-mono">{r.changed_at.slice(0, 10)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 100 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-center">
            يعرض أول 100 من {filteredRows.length} سجل
          </div>
        )}
      </div>
    </div>
  )
}

// ── 13. Actual FC vs Theoretical ─────────────────────────────────

interface FCMonthRow {
  month: string
  rev: number
  fcTheoretical: number   // % من الوصفات
  fcPurchases: number     // % من المشتريات
  fcWaste: number         // % من الهدر
  gap: number             // فجوة غير مفسّرة = fcPurchases - fcTheoretical - fcWaste
  purchasesAmt: number
  theoreticalAmt: number
  wasteAmt: number
}

function ActualFCReport({ brand, month, branch = '', fcLow = 35, fcHigh = 45 }: { brand: string; month: string; branch?: string; fcLow?: number; fcHigh?: number }) {
  const [rows, setRows]   = useState<FCMonthRow[]>([])
  const [loading, setLoading] = useState(true)
  const [nMonths, setNMonths] = useState(6)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const months = lastNMonths(nMonths)

      // 4 queries موحّدة بدل nMonths × 4
      const rangeStart = monthRange(months[months.length - 1]).start
      const rangeEnd   = monthRange(months[0]).end

      const [{ data: sales }, { data: purchases }, { data: wasteLogs }, { data: recipes }] = await Promise.all([
        wb((supabase.from('daily_sales') as any)
          .select('sale_date, product_sku, qty_sold, revenue')
          .eq('brand_id', brand).gte('sale_date', rangeStart).lte('sale_date', rangeEnd).limit(20000), branch),
        (supabase.from('purchases') as any)
          .select('purchase_date, total_price')
          .eq('brand_id', brand).gte('purchase_date', rangeStart).lte('purchase_date', rangeEnd).limit(10000),
        (supabase.from('waste_log') as any)
          .select('log_date, value')
          .eq('brand_id', brand).gte('log_date', rangeStart).lte('log_date', rangeEnd).limit(5000),
        (supabase.from('recipes') as any)
          .select('sku, food_cost_pct')
          .eq('brand_id', brand).eq('is_active', true),
      ])

      const recipeMap = new Map<string, number>()
      for (const r of (recipes || []) as any[]) recipeMap.set(r.sku, r.food_cost_pct)

      // Group by month
      const revMap  = new Map<string, number>()
      const costMap = new Map<string, number>()  // theoretical
      const purMap  = new Map<string, number>()
      const wstMap  = new Map<string, number>()

      for (const s of (sales || []) as any[]) {
        const m = (s.sale_date as string).slice(0, 7)
        const rev = s.revenue / VAT_RATE
        revMap.set(m, (revMap.get(m) ?? 0) + rev)
        const fc = recipeMap.get(s.product_sku)
        if (fc) costMap.set(m, (costMap.get(m) ?? 0) + rev * (fc / 100))
      }
      for (const p of (purchases || []) as any[]) {
        const m = (p.purchase_date as string).slice(0, 7)
        purMap.set(m, (purMap.get(m) ?? 0) + p.total_price)
      }
      for (const w of (wasteLogs || []) as any[]) {
        const m = (w.log_date as string).slice(0, 7)
        wstMap.set(m, (wstMap.get(m) ?? 0) + (w.value ?? 0))
      }

      const result: FCMonthRow[] = months.map(m => {
        const rev  = revMap.get(m) ?? 0
        const pur  = purMap.get(m) ?? 0
        const th   = costMap.get(m) ?? 0
        const wst  = wstMap.get(m) ?? 0
        const fcTh  = rev > 0 ? (th  / rev) * 100 : 0
        const fcPur = rev > 0 ? (pur / rev) * 100 : 0
        const fcWst = rev > 0 ? (wst / rev) * 100 : 0
        const gap   = fcPur - fcTh - fcWst
        return { month: formatYearMonth(m), rev, fcTheoretical: fcTh, fcPurchases: fcPur, fcWaste: fcWst, gap, purchasesAmt: pur, theoreticalAmt: th, wasteAmt: wst }
      }).reverse()

      setRows(result)
      setLoading(false)
    }
    load()
  }, [brand, nMonths])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>

  const current = rows.find(r => r.month === formatYearMonth(month)) ?? rows[rows.length - 1]
  const hasData  = rows.some(r => r.rev > 0)

  const fc  = (v: number) => v <= fcLow ? 'text-green-600' : v <= fcHigh ? 'text-amber-600' : v > 0 ? 'text-red-600' : 'text-gray-300'
  const gap = (v: number) => Math.abs(v) < 2 ? 'text-green-600' : Math.abs(v) < 5 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">FC% فعلي vs نظري</h2>
          <p className="text-xs text-gray-500 mt-0.5">الفجوة = مشتريات − نظري − هدر مسجّل → تسريب خفي</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[3, 6, 12].map(n => (
            <button key={n} onClick={() => setNMonths(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${nMonths === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {n} أشهر
            </button>
          ))}
        </div>
      </div>

      {/* KPI الشهر الحالي */}
      {current && current.rev > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">الإيراد ({current.month})</div>
            <div className="text-xl font-bold font-mono text-blue-700">{current.rev.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">FC% نظري (وصفات)</div>
            <div className={`text-xl font-bold font-mono ${fc(current.fcTheoretical)}`}>{current.fcTheoretical.toFixed(1)}%</div>
            <div className="text-xs text-gray-400 mt-0.5">{current.theoreticalAmt.toFixed(0)} ر.س</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">FC% مشتريات (فعلي)</div>
            <div className={`text-xl font-bold font-mono ${fc(current.fcPurchases)}`}>{current.fcPurchases.toFixed(1)}%</div>
            <div className="text-xs text-gray-400 mt-0.5">{current.purchasesAmt.toFixed(0)} ر.س</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">FC% هدر مسجّل</div>
            <div className={`text-xl font-bold font-mono ${current.fcWaste > 3 ? 'text-amber-600' : 'text-gray-600'}`}>{current.fcWaste.toFixed(1)}%</div>
            <div className="text-xs text-gray-400 mt-0.5">{current.wasteAmt.toFixed(0)} ر.س</div>
          </div>
          <div className={`border rounded-xl p-4 ${Math.abs(current.gap) >= 5 ? 'bg-red-50 border-red-200' : Math.abs(current.gap) >= 2 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
            <div className="text-xs text-gray-500 mb-1">الفجوة غير المفسّرة</div>
            <div className={`text-xl font-bold font-mono ${gap(current.gap)}`}>{current.gap >= 0 ? '+' : ''}{current.gap.toFixed(1)}%</div>
            <div className="text-xs mt-0.5 text-gray-500">
              {Math.abs(current.gap) < 2 ? 'ضمن الطبيعي ✓' : Math.abs(current.gap) < 5 ? 'تحذير — راجع الهدر' : 'تسريب مرتفع — تحقيق مطلوب'}
            </div>
          </div>
        </div>
      )}

      {/* تفسير المعادلة */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800 space-y-1">
        <div className="font-semibold">كيف تُفسَّر الأرقام:</div>
        <div>• <span className="font-semibold">FC نظري</span>: ما كان يجب أن يُصرف من مواد بناءً على الوصفات × المبيعات</div>
        <div>• <span className="font-semibold">FC مشتريات</span>: ما اشتريته فعلياً خلال الفترة ÷ الإيراد (يعكس الإنفاق الحقيقي)</div>
        <div>• <span className="font-semibold">الفجوة</span> = مشتريات − نظري − هدر = هدر غير مسجّل / سرقة / فروق جرد</div>
      </div>

      {/* مخطط الاتجاه */}
      {hasData && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">مقارنة FC% عبر الزمن</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={['auto', 'auto']} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`]} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
              <Line type="monotone" dataKey="fcTheoretical" name="FC% نظري"    stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="fcPurchases"  name="FC% مشتريات"  stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="fcWaste"      name="FC% هدر"       stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="gap"          name="الفجوة"        stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="6 3" />
              <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="2 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* جدول تفصيلي */}
      {hasData && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="font-semibold text-sm text-gray-900">جدول تفصيلي شهري</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
                  <th className="text-right px-4 py-2.5 font-medium">الشهر</th>
                  <th className="text-left px-4 py-2.5 font-medium">الإيراد</th>
                  <th className="text-center px-4 py-2.5 font-medium bg-blue-50 text-blue-700">FC% نظري</th>
                  <th className="text-center px-4 py-2.5 font-medium bg-red-50 text-red-700">FC% مشتريات</th>
                  <th className="text-center px-4 py-2.5 font-medium bg-amber-50 text-amber-700">FC% هدر</th>
                  <th className="text-center px-4 py-2.5 font-medium bg-purple-50 text-purple-700">الفجوة</th>
                  <th className="text-right px-4 py-2.5 font-medium">التقييم</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.month}</td>
                    <td className="px-4 py-2.5 font-mono text-blue-700 text-xs">{r.rev > 0 ? `${r.rev.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س` : '—'}</td>
                    <td className={`px-4 py-2.5 text-center font-mono font-semibold ${fc(r.fcTheoretical)}`}>{r.rev > 0 ? `${r.fcTheoretical.toFixed(1)}%` : '—'}</td>
                    <td className={`px-4 py-2.5 text-center font-mono font-semibold ${fc(r.fcPurchases)}`}>{r.purchasesAmt > 0 ? `${r.fcPurchases.toFixed(1)}%` : '—'}</td>
                    <td className={`px-4 py-2.5 text-center font-mono ${r.fcWaste > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{r.fcWaste > 0 ? `${r.fcWaste.toFixed(1)}%` : '—'}</td>
                    <td className={`px-4 py-2.5 text-center font-mono font-bold ${gap(r.gap)}`}>
                      {r.rev > 0 && r.purchasesAmt > 0 ? `${r.gap >= 0 ? '+' : ''}${r.gap.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.rev > 0 && r.purchasesAmt > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${Math.abs(r.gap) < 2 ? 'bg-green-50 text-green-700' : Math.abs(r.gap) < 5 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                          {Math.abs(r.gap) < 2 ? 'طبيعي' : Math.abs(r.gap) < 5 ? 'تحذير' : 'تحقيق مطلوب'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">ملاحظة: FC مشتريات قد يختلف عن FC نظري بسبب تغيّر المخزون (شراء للمخزون لا للبيع المباشر). الفجوة ≥ 5% تستحق مراجعة.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 14. Dine-in vs Dine-out Report ───────────────────────────────

function DineReport({ brand, fcLow = 35, fcHigh = 45 }: { brand: string; fcLow?: number; fcHigh?: number }) {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [sortBy, setSortBy]   = useState<'name' | 'diff'>('diff')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data } = await (supabase.from('recipes') as any)
        .select('sku, product_name, sell_price, app_price, food_cost_pct, dine_out_food_cost_pct, total_cost, dine_out_total_cost, margin, dine_out_margin, yield_portions')
        .eq('brand_id', brand).eq('is_active', true).eq('is_semi', false)
        .not('app_price', 'is', null)
        .order('product_name')
      setRows((data || []) as any[])
      setLoading(false)
    }
    load()
  }, [brand])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!rows.length) return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
      لا توجد وصفات نشطة لديها سعر تطبيق (app_price) محدد
    </div>
  )

  const processed = rows.map((r: any) => {
    const diPrice = r.sell_price / VAT_RATE
    const doPrice = r.app_price / VAT_RATE
    const diFc    = r.food_cost_pct ?? 0
    const doFc    = r.dine_out_food_cost_pct ?? (doPrice > 0 ? (r.dine_out_total_cost ?? r.total_cost) / doPrice * 100 : 0)
    const diMargin = r.margin ?? (diPrice - r.total_cost)
    const doMargin = r.dine_out_margin ?? (doPrice - (r.dine_out_total_cost ?? r.total_cost))
    const fcDiff   = doFc - diFc
    return { ...r, diPrice, doPrice, diFc, doFc, diMargin, doMargin, fcDiff, doHasData: !!r.app_price }
  })

  const filtered = (search ? processed.filter((r: any) => r.product_name.toLowerCase().includes(search.toLowerCase())) : processed)
    .sort((a: any, b: any) => sortBy === 'diff' ? Math.abs(b.fcDiff) - Math.abs(a.fcDiff) : a.product_name.localeCompare(b.product_name, 'ar'))

  const avgDiFc = processed.reduce((s: number, r: any) => s + r.diFc, 0) / processed.length
  const avgDoFc = processed.reduce((s: number, r: any) => s + r.doFc, 0) / processed.length
  const worse   = processed.filter((r: any) => r.fcDiff > 5).length
  const avgDiMargin = processed.reduce((s: number, r: any) => s + r.diMargin, 0) / processed.length
  const avgDoMargin = processed.reduce((s: number, r: any) => s + r.doMargin, 0) / processed.length

  const fc = (v: number) => v <= fcLow ? 'text-green-600' : v <= fcHigh ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">تقرير الداخل vs التوصيل (Dine-in vs Dine-out)</h2>
          <p className="text-xs text-gray-500 mt-0.5">{processed.length} منتج لديه سعر تطبيق</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs w-36 focus:outline-none focus:border-blue-500 bg-white" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 bg-white">
            <option value="diff">ترتيب بالفرق</option>
            <option value="name">ترتيب أبجدي</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">متوسط FC% — داخل</div>
          <div className={`text-xl font-bold font-mono ${fc(avgDiFc)}`}>{avgDiFc.toFixed(1)}%</div>
          <div className="text-xs text-gray-400 mt-0.5">هامش: {avgDiMargin.toFixed(2)} ر.س</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">متوسط FC% — توصيل</div>
          <div className={`text-xl font-bold font-mono ${fc(avgDoFc)}`}>{avgDoFc.toFixed(1)}%</div>
          <div className="text-xs text-gray-400 mt-0.5">هامش: {avgDoMargin.toFixed(2)} ر.س</div>
        </div>
        <div className={`rounded-xl border p-4 ${avgDoFc > avgDiFc ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <div className="text-xs text-gray-400 mb-1">فرق FC% (توصيل − داخل)</div>
          <div className={`text-xl font-bold font-mono ${avgDoFc > avgDiFc ? 'text-amber-700' : 'text-green-700'}`}>
            {avgDoFc >= avgDiFc ? '+' : ''}{(avgDoFc - avgDiFc).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {avgDoFc > avgDiFc ? 'التوصيل أغلى تكلفةً' : 'التوصيل أقل تكلفةً'}
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${worse > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className="text-xs text-gray-400 mb-1">منتجات فرق FC% أكثر من 5%</div>
          <div className={`text-xl font-bold font-mono ${worse > 0 ? 'text-red-600' : 'text-green-600'}`}>{worse}</div>
          <div className="text-xs text-gray-400 mt-0.5">تستحق مراجعة التسعير</div>
        </div>
      </div>

      {/* جدول المقارنة */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-right px-4 py-3 font-medium">المنتج</th>
                <th className="text-center px-3 py-3 font-medium bg-blue-50 text-blue-700" colSpan={3}>داخل المطعم</th>
                <th className="text-center px-3 py-3 font-medium bg-green-50 text-green-700" colSpan={3}>توصيل (تطبيق)</th>
                <th className="text-center px-3 py-3 font-medium">فرق FC%</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] text-gray-400">
                <th className="px-4 py-1.5" />
                <th className="text-center px-3 py-1.5">السعر (قبل VAT)</th>
                <th className="text-center px-3 py-1.5">FC%</th>
                <th className="text-center px-3 py-1.5">هامش</th>
                <th className="text-center px-3 py-1.5">السعر (قبل VAT)</th>
                <th className="text-center px-3 py-1.5">FC%</th>
                <th className="text-center px-3 py-1.5">هامش</th>
                <th className="text-center px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any, i: number) => (
                <tr key={r.sku} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900 text-xs">{r.product_name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{r.sku}</div>
                  </td>
                  {/* DI */}
                  <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{r.diPrice.toFixed(2)}</td>
                  <td className={`px-3 py-2.5 text-center font-mono font-semibold text-xs ${fc(r.diFc)}`}>{r.diFc.toFixed(1)}%</td>
                  <td className={`px-3 py-2.5 text-center font-mono text-xs ${r.diMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{r.diMargin.toFixed(2)}</td>
                  {/* DO */}
                  <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{r.doPrice.toFixed(2)}</td>
                  <td className={`px-3 py-2.5 text-center font-mono font-semibold text-xs ${fc(r.doFc)}`}>{r.doFc.toFixed(1)}%</td>
                  <td className={`px-3 py-2.5 text-center font-mono text-xs ${r.doMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{r.doMargin.toFixed(2)}</td>
                  {/* Diff */}
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs font-mono font-bold ${Math.abs(r.fcDiff) < 2 ? 'text-gray-400' : r.fcDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {r.fcDiff >= 0 ? '+' : ''}{r.fcDiff.toFixed(1)}%
                    </span>
                    {Math.abs(r.fcDiff) > 5 && <div className="text-[9px] text-red-500 mt-0.5">راجع التسعير</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400">السعر قبل VAT · الهامش = سعر البيع − تكلفة الوصفة · فرق FC% إيجابي يعني التوصيل أغلى نسبياً</p>
        </div>
      </div>
    </div>
  )
}

// ── 15. Discounts & Returns Report ───────────────────────────────

function DiscountsReport({ brand, month, branch = '' }: { brand: string; month: string; branch?: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const { start, end } = monthRange(month)
      const { data: sales } = await wb(
        (supabase.from('daily_sales') as any)
          .select('product_sku, product_name, qty_sold, revenue, discount_amount, return_amount, cancel_amount, return_qty, cancel_qty, branch_name')
          .eq('brand_id', brand).gte('sale_date', start).lte('sale_date', end), branch)
      if (!sales?.length) { setData(null); setLoading(false); return }

      const rows = sales as any[]
      const totalRev    = rows.reduce((s: number, r: any) => s + r.revenue, 0) / VAT_RATE
      const totalDisc   = rows.reduce((s: number, r: any) => s + (r.discount_amount ?? 0), 0) / VAT_RATE
      const totalReturn = rows.reduce((s: number, r: any) => s + (r.return_amount ?? 0), 0) / VAT_RATE
      const totalCancel = rows.reduce((s: number, r: any) => s + (r.cancel_amount ?? 0), 0) / VAT_RATE
      const totalImpact = totalDisc + totalReturn + totalCancel

      // FC% الصافي بعد خصم الخصومات
      const netRev = Math.max(0, totalRev - totalDisc - totalReturn - totalCancel)
      const discImpactOnFc = totalRev > 0 && netRev > 0
        ? 0  // placeholder — would need theoretical cost
        : 0

      // حسب المنتج
      const byProduct = new Map<string, any>()
      for (const r of rows) {
        const key = r.product_sku || r.product_name
        const ex = byProduct.get(key)
        if (ex) {
          ex.revenue += r.revenue / VAT_RATE
          ex.discount += (r.discount_amount ?? 0) / VAT_RATE
          ex.returnAmt += (r.return_amount ?? 0) / VAT_RATE
          ex.cancelAmt += (r.cancel_amount ?? 0) / VAT_RATE
          ex.returnQty += r.return_qty ?? 0
          ex.cancelQty += r.cancel_qty ?? 0
          ex.qty += r.qty_sold
        } else {
          byProduct.set(key, {
            name: r.product_name, sku: r.product_sku,
            revenue: r.revenue / VAT_RATE,
            discount: (r.discount_amount ?? 0) / VAT_RATE,
            returnAmt: (r.return_amount ?? 0) / VAT_RATE,
            cancelAmt: (r.cancel_amount ?? 0) / VAT_RATE,
            returnQty: r.return_qty ?? 0,
            cancelQty: r.cancel_qty ?? 0,
            qty: r.qty_sold,
          })
        }
      }

      // حسب الفرع
      const byBranch = new Map<string, any>()
      for (const r of rows) {
        const b = r.branch_name || 'غير محدد'
        const ex = byBranch.get(b)
        if (ex) {
          ex.revenue += r.revenue / VAT_RATE
          ex.discount += (r.discount_amount ?? 0) / VAT_RATE
          ex.returnAmt += (r.return_amount ?? 0) / VAT_RATE
        } else {
          byBranch.set(b, { revenue: r.revenue / VAT_RATE, discount: (r.discount_amount ?? 0) / VAT_RATE, returnAmt: (r.return_amount ?? 0) / VAT_RATE })
        }
      }

      const topByDiscount = [...byProduct.values()]
        .filter((p: any) => p.discount + p.returnAmt + p.cancelAmt > 0)
        .sort((a: any, b: any) => (b.discount + b.returnAmt + b.cancelAmt) - (a.discount + a.returnAmt + a.cancelAmt))
        .slice(0, 10)

      const branchData = [...byBranch.entries()]
        .map(([name, d]) => ({ name, ...d, discRate: d.revenue > 0 ? ((d.discount + d.returnAmt) / d.revenue) * 100 : 0 }))
        .sort((a: any, b: any) => b.discRate - a.discRate)

      setData({ totalRev, totalDisc, totalReturn, totalCancel, totalImpact, netRev, topByDiscount, branchData })
      setLoading(false)
    }
    load()
  }, [brand, month, branch])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>
  if (!data) return <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">لا توجد بيانات مبيعات لهذا الشهر</div>

  const d = data
  const pct = (v: number) => d.totalRev > 0 ? `${((v / d.totalRev) * 100).toFixed(1)}%` : '—'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">تقرير الخصومات والمرتجعات — {formatYearMonth(month)}</h2>
        <p className="text-xs text-gray-500 mt-0.5">أثر الخصومات والإلغاءات على صافي الإيراد</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="الإيراد الإجمالي" value={`${d.totalRev.toFixed(0)} ر.س`} color="text-blue-700" />
        <KpiCard label="الخصومات" value={`${d.totalDisc.toFixed(0)} ر.س`} sub={pct(d.totalDisc)} color="text-amber-600" />
        <KpiCard label="المرتجعات" value={`${d.totalReturn.toFixed(0)} ر.س`} sub={pct(d.totalReturn)} color="text-red-600" />
        <KpiCard label="الإلغاءات" value={`${d.totalCancel.toFixed(0)} ر.س`} sub={pct(d.totalCancel)} color="text-orange-600" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl border p-4 ${d.totalImpact / d.totalRev > 0.05 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="text-xs text-gray-500 mb-1">إجمالي التأثير على الإيراد</div>
          <div className={`text-2xl font-bold font-mono ${d.totalImpact / d.totalRev > 0.05 ? 'text-red-700' : 'text-gray-700'}`}>
            −{d.totalImpact.toFixed(0)} ر.س
          </div>
          <div className="text-xs text-gray-400 mt-1">{pct(d.totalImpact)} من الإيراد الإجمالي</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">صافي الإيراد (بعد الخصومات)</div>
          <div className="text-2xl font-bold font-mono text-green-700">{d.netRev.toFixed(0)} ر.س</div>
          <div className="text-xs text-gray-400 mt-1">{((d.netRev / d.totalRev) * 100).toFixed(1)}% من الإجمالي</div>
        </div>
      </div>

      {d.topByDiscount.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="font-semibold text-sm text-gray-900">أكثر المنتجات خصوماً ومرتجعات</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
                <th className="text-right px-4 py-2.5 font-medium">المنتج</th>
                <th className="text-center px-3 py-2.5 font-medium">المبيعات</th>
                <th className="text-center px-3 py-2.5 font-medium text-amber-600">خصم</th>
                <th className="text-center px-3 py-2.5 font-medium text-red-600">مرتجع</th>
                <th className="text-center px-3 py-2.5 font-medium text-orange-600">إلغاء</th>
                <th className="text-center px-3 py-2.5 font-medium">نسبة التأثير</th>
              </tr>
            </thead>
            <tbody>
              {d.topByDiscount.map((p: any, i: number) => {
                const impact = p.discount + p.returnAmt + p.cancelAmt
                const rate = p.revenue > 0 ? (impact / p.revenue) * 100 : 0
                return (
                  <tr key={i} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900 text-xs">{p.name}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-gray-600 text-xs">{p.revenue.toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-amber-600 text-xs font-semibold">{p.discount > 0 ? p.discount.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-red-600 text-xs font-semibold">{p.returnAmt > 0 ? p.returnAmt.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-orange-600 text-xs font-semibold">{p.cancelAmt > 0 ? p.cancelAmt.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs font-mono font-bold ${rate > 10 ? 'text-red-600' : rate > 5 ? 'text-amber-600' : 'text-gray-500'}`}>
                        {rate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {d.branchData.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="font-semibold text-sm text-gray-900">معدل الخصومات حسب الفرع</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
                <th className="text-right px-4 py-2.5 font-medium">الفرع</th>
                <th className="text-center px-4 py-2.5 font-medium">الإيراد</th>
                <th className="text-center px-4 py-2.5 font-medium">الخصومات</th>
                <th className="text-center px-4 py-2.5 font-medium">المرتجعات</th>
                <th className="text-center px-4 py-2.5 font-medium">معدل الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {d.branchData.map((b: any, i: number) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-gray-900 text-sm">{b.name}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-600 text-xs">{b.revenue.toFixed(0)}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-amber-600 text-xs">{b.discount.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-red-600 text-xs">{b.returnAmt.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs font-mono font-bold ${b.discRate > 10 ? 'text-red-600' : b.discRate > 5 ? 'text-amber-600' : 'text-green-600'}`}>
                      {b.discRate.toFixed(1)}%
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

// ── 16. Consumption Report ────────────────────────────────────────

function ConsumptionReport({ brand, month }: { brand: string; month: string }) {
  const [rows, setRows]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const { start, end } = monthRange(month)

      const [{ data: purchases }, { data: consumed }, { data: ings }] = await Promise.all([
        // مجموع المشتريات لكل مادة في الشهر
        (supabase.from('purchases') as any)
          .select('ing_sku, ing_name, qty, unit, total_price')
          .eq('brand_id', brand).gte('purchase_date', start).lte('purchase_date', end),
        // مجموع الحركات الصادرة (صرف + هدر) لكل مادة في الشهر
        (supabase.from('stock_movements') as any)
          .select('ing_sku, ing_name, qty, movement_type')
          .eq('brand_id', brand).gte('created_at', start + 'T00:00:00').lte('created_at', end + 'T23:59:59')
          .in('movement_type', ['out', 'waste']),
        // تكلفة الوحدة الحالية
        (supabase.from('ingredients') as any).select('sku, name, unit, cost').eq('brand_id', brand),
      ])

      // بناء map المشتريات
      const purMap = new Map<string, { name: string; unit: string; qty: number; value: number }>()
      for (const p of (purchases || []) as any[]) {
        const ex = purMap.get(p.ing_sku)
        if (ex) { ex.qty += p.qty; ex.value += p.total_price }
        else purMap.set(p.ing_sku, { name: p.ing_name, unit: p.unit ?? '—', qty: p.qty, value: p.total_price })
      }

      // بناء map الاستهلاك
      const conMap = new Map<string, number>()
      for (const c of (consumed || []) as any[]) {
        conMap.set(c.ing_sku, (conMap.get(c.ing_sku) ?? 0) + c.qty)
      }

      // تكلفة الوحدة
      const costMap = new Map<string, number>()
      for (const i of (ings || []) as any[]) costMap.set(i.sku, i.cost ?? 0)

      // دمج الكل
      const allSkus = new Set([...purMap.keys(), ...conMap.keys()])
      const result: any[] = []
      for (const sku of allSkus) {
        const pur = purMap.get(sku)
        const con = conMap.get(sku) ?? 0
        const unitCost = costMap.get(sku) ?? (pur ? pur.value / Math.max(pur.qty, 0.001) : 0)
        const purQty = pur?.qty ?? 0
        const balance = purQty - con  // فائض = اشترينا أكثر مما صرفنا، عجز = صرفنا من المخزون القديم
        result.push({
          sku, name: pur?.name ?? sku, unit: pur?.unit ?? '—',
          purQty, purValue: pur?.value ?? 0,
          conQty: con, conValue: con * unitCost,
          balance, unitCost,
        })
      }
      result.sort((a: any, b: any) => Math.abs(b.balance) - Math.abs(a.balance))
      setRows(result)
      setLoading(false)
    }
    load()
  }, [brand, month, branch])

  if (loading) return <div className="py-16 text-center text-gray-400">جارٍ التحميل...</div>

  const totalPurValue = rows.reduce((s: number, r: any) => s + r.purValue, 0)
  const totalConValue = rows.reduce((s: number, r: any) => s + r.conValue, 0)
  const filtered = search ? rows.filter((r: any) => r.name.toLowerCase().includes(search.toLowerCase())) : rows

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">استهلاك المواد الخام — {formatYearMonth(month)}</h2>
          <p className="text-xs text-gray-500 mt-0.5">مقارنة المشتريات بالحركات الصادرة من المخزون</p>
        </div>
        <input type="text" placeholder="بحث بالمادة..." value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs w-40 focus:outline-none focus:border-blue-500 bg-white" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="إجمالي قيمة المشتريات" value={`${totalPurValue.toFixed(0)} ر.س`} color="text-blue-700" />
        <KpiCard label="إجمالي قيمة الصرف" value={`${totalConValue.toFixed(0)} ر.س`} color="text-red-600" />
        <KpiCard label="الفارق (مخزون + تسريب)" value={`${(totalPurValue - totalConValue).toFixed(0)} ر.س`}
          color={(totalPurValue - totalConValue) > 0 ? 'text-green-600' : 'text-amber-600'}
          sub={(totalPurValue - totalConValue) > 0 ? 'مخزون متراكم' : 'صرف من مخزون قديم'} />
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">لا توجد بيانات لهذا الشهر</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <th className="text-right px-4 py-3 font-medium">المادة</th>
                  <th className="text-center px-4 py-3 font-medium bg-blue-50 text-blue-700">كمية مشتراة</th>
                  <th className="text-center px-4 py-3 font-medium bg-red-50 text-red-700">كمية مصروفة</th>
                  <th className="text-center px-4 py-3 font-medium">الرصيد</th>
                  <th className="text-left px-4 py-3 font-medium">قيمة المشتريات</th>
                  <th className="text-left px-4 py-3 font-medium">قيمة الصرف</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any, i: number) => (
                  <tr key={r.sku} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900 text-xs">{r.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{r.sku} · {r.unit}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-blue-700 text-xs font-semibold">
                      {r.purQty > 0 ? r.purQty.toFixed(3) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-red-600 text-xs font-semibold">
                      {r.conQty > 0 ? r.conQty.toFixed(3) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`font-mono font-bold text-xs ${r.balance > 0 ? 'text-green-600' : r.balance < 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {r.balance !== 0 ? `${r.balance > 0 ? '+' : ''}${r.balance.toFixed(3)}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-700 text-xs">{r.purValue > 0 ? `${r.purValue.toFixed(2)} ر.س` : '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-700 text-xs">{r.conValue > 0 ? `${r.conValue.toFixed(2)} ر.س` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">الرصيد الموجب = مشتريات أكثر من الصرف (تراكم مخزون). الرصيد السالب = صرف من المخزون القديم أو هدر غير مسجّل.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 17. Compare P&L Between Two Periods ──────────────────────────

interface PLData {
  rev: number; vat: number; mat: number; labor: number; overhead: number
  gross: number; net: number; fcPct: number; netPct: number
}

async function loadPLForMonth(supabase: any, brand: string, m: string): Promise<PLData> {
  const { start, end } = monthRange(m)
  const [{ data: sales }, { data: purchases }, { data: labor }, { data: overhead }] = await Promise.all([
    (supabase.from('daily_sales') as any).select('revenue').eq('brand_id', brand).gte('sale_date', start).lte('sale_date', end),
    (supabase.from('purchases') as any).select('total_price').eq('brand_id', brand).gte('purchase_date', start).lte('purchase_date', end),
    (supabase.from('labor_costs') as any).select('amount').eq('brand_id', brand).eq('month', m),
    (supabase.from('overhead_costs') as any).select('amount').eq('brand_id', brand).eq('month', m),
  ])
  const totalRevVat = (sales || []).reduce((s: number, r: any) => s + r.revenue, 0)
  const rev       = totalRevVat / VAT_RATE
  const vat       = totalRevVat - rev
  const mat       = (purchases || []).reduce((s: number, r: any) => s + r.total_price, 0)
  const laborAmt  = (labor || []).reduce((s: number, r: any) => s + r.amount, 0)
  const ovhAmt    = (overhead || []).reduce((s: number, r: any) => s + r.amount, 0)
  const gross     = rev - mat
  const net       = rev - mat - laborAmt - ovhAmt
  const fcPct     = rev > 0 ? (mat / rev) * 100 : 0
  const netPct    = rev > 0 ? (net / rev) * 100 : 0
  return { rev, vat, mat, labor: laborAmt, overhead: ovhAmt, gross, net, fcPct, netPct }
}

function ComparePLReport({ brand, months }: { brand: string; months: string[] }) {
  const [periodA, setPeriodA] = useState(months[1] ?? months[0])
  const [periodB, setPeriodB] = useState(months[0])
  const [dataA, setDataA]     = useState<PLData | null>(null)
  const [dataB, setDataB]     = useState<PLData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!periodA || !periodB) return
    setLoading(true)
    const supabase = createClient()
    Promise.all([loadPLForMonth(supabase, brand, periodA), loadPLForMonth(supabase, brand, periodB)])
      .then(([a, b]) => { setDataA(a); setDataB(b); setLoading(false) })
  }, [brand, periodA, periodB])

  const selCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

  function Delta({ a, b, invert = false }: { a: number; b: number; invert?: boolean }) {
    if (a === 0 && b === 0) return <span className="text-gray-300 text-xs">—</span>
    const pct = a !== 0 ? ((b - a) / Math.abs(a)) * 100 : 0
    const up  = b > a
    const good = invert ? !up : up
    return (
      <span className={`text-xs font-mono font-semibold flex items-center gap-0.5 justify-center ${good ? 'text-green-600' : 'text-red-600'}`}>
        {up ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
      </span>
    )
  }

  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const pct = (v: number) => `${v.toFixed(1)}%`

  const rows: { label: string; keyA: keyof PLData; keyB: keyof PLData; isBetter: 'higher' | 'lower'; color?: string }[] = [
    { label: 'الإيراد (قبل VAT)',   keyA: 'rev',      keyB: 'rev',      isBetter: 'higher', color: 'text-blue-700' },
    { label: 'ضريبة القيمة المضافة', keyA: 'vat',      keyB: 'vat',      isBetter: 'higher', color: 'text-gray-400' },
    { label: 'تكلفة المواد الخام',   keyA: 'mat',      keyB: 'mat',      isBetter: 'lower',  color: 'text-red-600' },
    { label: 'FC%',                  keyA: 'fcPct',    keyB: 'fcPct',    isBetter: 'lower',  color: 'text-orange-600' },
    { label: 'مجمل الربح',           keyA: 'gross',    keyB: 'gross',    isBetter: 'higher', color: 'text-emerald-600' },
    { label: 'تكاليف العمالة',       keyA: 'labor',    keyB: 'labor',    isBetter: 'lower',  color: 'text-purple-600' },
    { label: 'التكاليف الثابتة',     keyA: 'overhead', keyB: 'overhead', isBetter: 'lower',  color: 'text-amber-600' },
    { label: 'صافي الربح',           keyA: 'net',      keyB: 'net',      isBetter: 'higher', color: 'text-emerald-700' },
    { label: 'هامش صافي%',          keyA: 'netPct',   keyB: 'netPct',   isBetter: 'higher', color: 'text-emerald-600' },
  ]

  const isPct = (k: string) => k === 'fcPct' || k === 'netPct'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">مقارنة P&L بين فترتين</h2>
        <p className="text-xs text-gray-500 mt-0.5">قارن أداء أي شهرَين وحدّد الأفضل والأسوأ</p>
      </div>

      {/* Period selectors */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
              الفترة الأولى (A)
            </label>
            <select value={periodA} onChange={e => setPeriodA(e.target.value)} className={`${selCls} w-full`}>
              {months.map(m => <option key={m} value={m} disabled={m === periodB}>{formatYearMonth(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
              الفترة الثانية (B)
            </label>
            <select value={periodB} onChange={e => setPeriodB(e.target.value)} className={`${selCls} w-full`}>
              {months.map(m => <option key={m} value={m} disabled={m === periodA}>{formatYearMonth(m)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading && <div className="py-10 text-center text-gray-400">جارٍ المقارنة...</div>}

      {!loading && dataA && dataB && (
        <>
          {/* KPI Cards — Headline comparison */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'الإيراد A', value: `${fmt(dataA.rev)} ر.س`, color: 'text-blue-700' },
              { label: 'الإيراد B', value: `${fmt(dataB.rev)} ر.س`, color: 'text-green-700' },
              { label: 'صافي الربح A', value: `${fmt(dataA.net)} ر.س`, color: dataA.net >= 0 ? 'text-emerald-700' : 'text-red-700' },
              { label: 'صافي الربح B', value: `${fmt(dataB.net)} ر.س`, color: dataB.net >= 0 ? 'text-emerald-700' : 'text-red-700' },
            ].map(c => (
              <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                <div className={`text-lg font-bold font-mono ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Comparison table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 grid grid-cols-4 text-xs font-medium text-gray-600">
              <span>البند</span>
              <span className="text-center flex items-center gap-1.5 justify-center"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{formatYearMonth(periodA)}</span>
              <span className="text-center flex items-center gap-1.5 justify-center"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{formatYearMonth(periodB)}</span>
              <span className="text-center">التغيّر (B vs A)</span>
            </div>
            <div>
              {rows.map((row, i) => {
                const vA = dataA[row.keyA] as number
                const vB = dataB[row.keyB] as number
                const isP = isPct(row.keyA as string)
                return (
                  <div key={i} className={`grid grid-cols-4 items-center px-5 py-3 border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <span className={`text-sm font-medium ${row.color ?? 'text-gray-800'}`}>{row.label}</span>
                    <span className="text-center font-mono text-sm text-gray-700">
                      {isP ? pct(vA) : `${fmt(vA)} ر.س`}
                    </span>
                    <span className="text-center font-mono text-sm text-gray-700">
                      {isP ? pct(vB) : `${fmt(vB)} ر.س`}
                    </span>
                    <div className="flex flex-col items-center">
                      <Delta a={vA} b={vB} invert={row.isBetter === 'lower'} />
                      {!isP && (
                        <span className={`text-[10px] font-mono mt-0.5 ${vB >= vA ? 'text-green-500' : 'text-red-500'}`}>
                          {vB >= vA ? '+' : ''}{(vB - vA).toFixed(0)} ر.س
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Winner banner */}
          {(() => {
            const winnerRev    = dataB.rev > dataA.rev ? 'B' : dataA.rev > dataB.rev ? 'A' : '='
            const winnerMargin = dataB.net > dataA.net ? 'B' : dataA.net > dataB.net ? 'A' : '='
            const winnerFc     = dataB.fcPct < dataA.fcPct ? 'B' : dataA.fcPct < dataB.fcPct ? 'A' : '='
            const score = { A: 0, B: 0, '=': 0 }
            ;[winnerRev, winnerMargin, winnerFc].forEach(w => { if (w !== '=') score[w as 'A' | 'B']++ })
            const overall = score.B > score.A ? 'B' : score.A > score.B ? 'A' : '='
            if (overall === '=') return null
            const winner = overall === 'A' ? { period: formatYearMonth(periodA), color: 'bg-blue-50 border-blue-200 text-blue-800' } : { period: formatYearMonth(periodB), color: 'bg-green-50 border-green-200 text-green-800' }
            const reasons: string[] = []
            if (winnerRev === overall) reasons.push('إيراد أعلى')
            if (winnerFc === overall) reasons.push('FC% أقل')
            if (winnerMargin === overall) reasons.push('هامش أفضل')
            return (
              <div className={`rounded-xl border px-5 py-3 text-sm font-semibold ${winner.color}`}>
                الفترة الأفضل أداءً: {winner.period} — {reasons.join('، ')}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
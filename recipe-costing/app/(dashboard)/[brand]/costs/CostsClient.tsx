'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { getCurrentYearMonth, lastNMonths, formatYearMonth, monthRange } from '@/lib/period'
import type { LaborCost, LaborDept, OverheadCost, OverheadCategory, MonthlyBudget, BrandId } from '@/types'

interface Props {
  initialLabor: LaborCost[]
  initialOverhead: OverheadCost[]
  brand: BrandId
}

type Tab = 'labor' | 'overhead' | 'budget'

// ── Labor departments ────────────────────────────────────────────
const LABOR_DEPTS: { value: LaborDept; label: string; color: string }[] = [
  { value: 'kitchen',  label: 'مطبخ',         color: 'bg-orange-50 text-orange-700' },
  { value: 'service',  label: 'خدمة عملاء',   color: 'bg-blue-50 text-blue-700' },
  { value: 'cashier',  label: 'كاشير',         color: 'bg-purple-50 text-purple-700' },
  { value: 'delivery', label: 'توصيل',         color: 'bg-green-50 text-green-700' },
  { value: 'admin',    label: 'إداري',         color: 'bg-slate-50 text-slate-700' },
  { value: 'other',    label: 'أخرى',          color: 'bg-gray-50 text-gray-600' },
]

// ── Overhead categories ──────────────────────────────────────────
const OVERHEAD_CATS: { value: OverheadCategory; label: string }[] = [
  { value: 'rent',        label: 'إيجار' },
  { value: 'electricity', label: 'كهرباء' },
  { value: 'gas',         label: 'غاز' },
  { value: 'maintenance', label: 'صيانة' },
  { value: 'marketing',   label: 'تسويق' },
  { value: 'other',       label: 'أخرى' },
]

const OVERHEAD_COLORS: Record<OverheadCategory, string> = {
  rent: 'bg-blue-50 text-blue-700',
  electricity: 'bg-yellow-50 text-yellow-700',
  gas: 'bg-orange-50 text-orange-700',
  maintenance: 'bg-gray-50 text-gray-700',
  marketing: 'bg-purple-50 text-purple-700',
  other: 'bg-slate-50 text-slate-700',
}

function deptLabel(d: LaborDept) { return LABOR_DEPTS.find(x => x.value === d)?.label ?? d }
function deptColor(d: LaborDept) { return LABOR_DEPTS.find(x => x.value === d)?.color ?? 'bg-gray-100 text-gray-700' }

// ── Budget comparison row ────────────────────────────────────────
function BudgetRow({
  label, actual, target, isAmount = false, invertGood = false,
}: { label: string; actual: number; target: number | null; isAmount?: boolean; invertGood?: boolean }) {
  const hasTarget = target !== null && target > 0
  const diff = hasTarget ? actual - target : null
  const pctDiff = hasTarget && target > 0 ? ((actual - target) / target) * 100 : null
  const isGood = diff === null ? null : (invertGood ? diff < 0 : diff > 0)

  const fmt = (v: number) => isAmount
    ? v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ر.س'
    : v.toFixed(1) + '%'

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-700 font-medium">{label}</td>
      <td className="px-4 py-3 text-sm font-mono text-gray-900 text-left">{fmt(actual)}</td>
      <td className="px-4 py-3 text-sm font-mono text-gray-500 text-left">
        {hasTarget ? fmt(target!) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 text-left">
        {diff === null ? (
          <span className="text-xs text-gray-300">لا يوجد هدف</span>
        ) : (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isGood ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {diff > 0 ? '+' : ''}{fmt(diff)}
            {pctDiff !== null && ` (${pctDiff > 0 ? '+' : ''}${pctDiff.toFixed(1)}%)`}
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function CostsClient({ initialLabor, initialOverhead, brand }: Props) {
  const { profile } = useUserStore()
  const months = lastNMonths(12)
  const [tab, setTab] = useState<Tab>('labor')
  const [month, setMonth] = useState(getCurrentYearMonth())

  // Labor
  const [labor, setLabor] = useState<LaborCost[]>(initialLabor)
  const [laborDept, setLaborDept] = useState<LaborDept>('kitchen')
  const [laborDesc, setLaborDesc] = useState('')
  const [laborAmt, setLaborAmt] = useState('')
  const [addingLabor, setAddingLabor] = useState(false)

  // Sync when server-side data refreshes (brand change)
  useEffect(() => { setLabor(initialLabor) }, [initialLabor])
  useEffect(() => { setOverhead(initialOverhead) }, [initialOverhead])

  // Overhead
  const [overhead, setOverhead] = useState<OverheadCost[]>(initialOverhead)
  const [ovCat, setOvCat] = useState<OverheadCategory>('rent')
  const [ovDesc, setOvDesc] = useState('')
  const [ovAmt, setOvAmt] = useState('')
  const [addingOv, setAddingOv] = useState(false)

  // Budget
  const [budget, setBudget] = useState<MonthlyBudget | null>(null)
  const [actualRevenue, setActualRevenue] = useState<number>(0)
  const [actualFoodCost, setActualFoodCost] = useState<number | null>(null)
  const [budgetForm, setBudgetForm] = useState({ revenue: '', fc_pct: '', labor_pct: '', overhead_pct: '' })
  const [savingBudget, setSavingBudget] = useState(false)
  const [budgetMsg, setBudgetMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [deleting, setDeleting] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const [copyMsg, setCopyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadLabor = useCallback(async () => {
    const supabase = createClient()
    const { data } = await (supabase.from('labor_costs') as any)
      .select('*').eq('brand_id', brand).eq('month', month).order('department').order('created_at')
    setLabor((data as LaborCost[]) || [])
  }, [brand, month])

  const loadOverhead = useCallback(async () => {
    const supabase = createClient()
    const { data } = await (supabase.from('overhead_costs') as any)
      .select('*').eq('brand_id', brand).eq('month', month).order('category')
    setOverhead((data as OverheadCost[]) || [])
  }, [brand, month])

  const loadBudget = useCallback(async () => {
    const supabase = createClient()
    const { start, end } = monthRange(month)

    const [{ data: bud }, { data: sales }] = await Promise.all([
      (supabase.from('monthly_budgets') as any)
        .select('*').eq('brand_id', brand).eq('month', month).maybeSingle(),
      (supabase.from('daily_sales') as any)
        .select('revenue').eq('brand_id', brand)
        .gte('sale_date', start).lte('sale_date', end),
    ])

    setBudget(bud ?? null)
    if (bud) {
      setBudgetForm({
        revenue:      String(bud.revenue_target ?? ''),
        fc_pct:       String(bud.fc_pct_target ?? ''),
        labor_pct:    String(bud.labor_pct_target ?? ''),
        overhead_pct: String(bud.overhead_pct_target ?? ''),
      })
    } else {
      setBudgetForm({ revenue: '', fc_pct: '', labor_pct: '', overhead_pct: '' })
    }

    const rev = (sales as any[] || []).reduce((s: number, r: any) => s + (r.revenue ?? 0), 0)
    setActualRevenue(rev)
    setActualFoodCost(null)
  }, [brand, month])

  useEffect(() => { loadLabor(); loadOverhead() }, [loadLabor, loadOverhead])
  useEffect(() => { if (tab === 'budget') loadBudget() }, [tab, loadBudget])

  async function addLabor() {
    if (!laborDesc.trim() || !laborAmt) return
    setAddingLabor(true)
    const supabase = createClient()
    await (supabase.from('labor_costs') as any).insert({
      brand_id: brand, month, department: laborDept,
      description: laborDesc.trim(), amount: parseFloat(laborAmt),
      created_by: profile?.id ?? null,
    })
    setLaborDesc(''); setLaborAmt('')
    await loadLabor()
    setAddingLabor(false)
  }

  async function addOverhead() {
    if (!ovDesc.trim() || !ovAmt) return
    setAddingOv(true)
    const supabase = createClient()
    await (supabase.from('overhead_costs') as any).insert({
      brand_id: brand, month, category: ovCat,
      description: ovDesc.trim(), amount: parseFloat(ovAmt),
      created_by: profile?.id ?? null,
    })
    setOvDesc(''); setOvAmt('')
    await loadOverhead()
    setAddingOv(false)
  }

  async function saveBudget() {
    setSavingBudget(true); setBudgetMsg(null)
    const supabase = createClient()
    const payload = {
      brand_id: brand, month,
      revenue_target:      budgetForm.revenue      ? parseFloat(budgetForm.revenue)      : null,
      fc_pct_target:       budgetForm.fc_pct       ? parseFloat(budgetForm.fc_pct)       : null,
      labor_pct_target:    budgetForm.labor_pct    ? parseFloat(budgetForm.labor_pct)    : null,
      overhead_pct_target: budgetForm.overhead_pct ? parseFloat(budgetForm.overhead_pct) : null,
      created_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await (supabase.from('monthly_budgets') as any)
      .upsert(payload, { onConflict: 'brand_id,month' })
    setSavingBudget(false)
    if (error) { setBudgetMsg({ ok: false, text: error.message }); return }
    setBudgetMsg({ ok: true, text: 'تم حفظ الميزانية ✓' })
    await loadBudget()
  }

  async function deleteItem(table: string, id: string, reload: () => void) {
    setDeleting(id)
    const supabase = createClient()
    await (supabase.from(table) as any).delete().eq('id', id)
    setDeleting(null)
    reload()
  }

  const totalLabor    = labor.reduce((s, r) => s + r.amount, 0)
  const totalOverhead = overhead.reduce((s, r) => s + r.amount, 0)

  // Group labor by department for summary
  const laborByDept = LABOR_DEPTS.map(d => ({
    ...d,
    total: labor.filter(r => r.department === d.value).reduce((s, r) => s + r.amount, 0),
    rows:  labor.filter(r => r.department === d.value),
  })).filter(d => d.rows.length > 0)

  // Budget actuals
  const laborPctActual    = actualRevenue > 0 ? (totalLabor    / actualRevenue) * 100 : 0
  const overheadPctActual = actualRevenue > 0 ? (totalOverhead / actualRevenue) * 100 : 0

  function prevMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  }

  async function copyFromPrev() {
    setCopying(true); setCopyMsg(null)
    const supabase = createClient()
    const prev = prevMonth(month)
    const [{ data: prevLabor }, { data: prevOv }] = await Promise.all([
      (supabase.from('labor_costs') as any).select('department, description, amount').eq('brand_id', brand).eq('month', prev),
      (supabase.from('overhead_costs') as any).select('category, description, amount').eq('brand_id', brand).eq('month', prev),
    ])
    if (!prevLabor?.length && !prevOv?.length) {
      setCopyMsg({ ok: false, text: 'لا توجد بنود في الشهر السابق للنسخ منه' })
      setCopying(false); return
    }
    await Promise.all([
      prevLabor?.length ? (supabase.from('labor_costs') as any).insert(
        prevLabor.map((r: any) => ({ brand_id: brand, month, department: r.department ?? 'other', description: r.description, amount: r.amount, created_by: profile?.id ?? null }))
      ) : Promise.resolve(),
      prevOv?.length ? (supabase.from('overhead_costs') as any).insert(
        prevOv.map((r: any) => ({ brand_id: brand, month, category: r.category, description: r.description, amount: r.amount, created_by: profile?.id ?? null }))
      ) : Promise.resolve(),
    ])
    await Promise.all([loadLabor(), loadOverhead()])
    setCopyMsg({ ok: true, text: `تم نسخ ${(prevLabor?.length ?? 0) + (prevOv?.length ?? 0)} بند من ${formatYearMonth(prev)} ✓` })
    setCopying(false)
  }

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 bg-white'

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">التكاليف الشهرية</h1>
          <p className="text-gray-500 text-sm mt-0.5">تكاليف العمالة والتكاليف الثابتة والميزانية</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {tab !== 'budget' && totalLabor === 0 && totalOverhead === 0 && (
            <button onClick={copyFromPrev} disabled={copying}
              className="text-sm px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium disabled:opacity-40 transition-colors whitespace-nowrap">
              {copying ? 'جارٍ النسخ...' : '📋 نسخ من الشهر السابق'}
            </button>
          )}
          <select value={month} onChange={e => { setMonth(e.target.value); setCopyMsg(null); setBudgetMsg(null) }} className={inputCls}>
            {months.map(m => <option key={m} value={m}>{formatYearMonth(m)}</option>)}
          </select>
        </div>
      </div>

      {copyMsg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm border ${copyMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {copyMsg.text}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'تكاليف العمالة',       value: totalLabor,                color: 'text-blue-700',  bg: 'bg-blue-50' },
          { label: 'التكاليف الثابتة',      value: totalOverhead,             color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'إجمالي التكاليف الشهرية', value: totalLabor + totalOverhead, color: 'text-red-700',   bg: 'bg-red-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 border border-gray-200`}>
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className={`text-xl font-bold font-mono ${c.color}`}>{c.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['labor', 'تكاليف العمالة'], ['overhead', 'التكاليف الثابتة'], ['budget', 'الميزانية']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === k ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Labor Tab ── */}
      {tab === 'labor' && (
        <div className="space-y-4">
          {/* Add form */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">إضافة بند عمالة</p>
            <div className="flex gap-3 flex-wrap">
              <select value={laborDept} onChange={e => setLaborDept(e.target.value as LaborDept)} className={inputCls}>
                {LABOR_DEPTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <input type="text" placeholder="الوصف (مثال: رواتب الطهاة)"
                value={laborDesc} onChange={e => setLaborDesc(e.target.value)}
                className={`${inputCls} flex-1 min-w-48`} />
              <input type="number" placeholder="المبلغ (ريال)"
                value={laborAmt} onChange={e => setLaborAmt(e.target.value)}
                className={`${inputCls} w-40`} min={0} />
              <button onClick={addLabor} disabled={addingLabor || !laborDesc.trim() || !laborAmt}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium disabled:opacity-40 transition-colors">
                {addingLabor ? '...' : '+ إضافة'}
              </button>
            </div>
          </div>

          {/* Department summary chips */}
          {laborByDept.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {laborByDept.map(d => (
                <div key={d.value} className={`text-xs px-3 py-1.5 rounded-full font-medium border border-gray-200 ${d.color}`}>
                  {d.label}: {d.total.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س
                  <span className="text-gray-400 mr-1">({totalLabor > 0 ? ((d.total / totalLabor) * 100).toFixed(0) : 0}%)</span>
                </div>
              ))}
            </div>
          )}

          {/* Labor list grouped by department */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {labor.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">لا توجد بنود عمالة لهذا الشهر</div>
            ) : (
              <table suppressHydrationWarning className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                    <th className="text-right px-4 py-2.5 font-medium">القسم</th>
                    <th className="text-right px-4 py-2.5 font-medium">الوصف</th>
                    <th className="text-left px-4 py-2.5 font-medium">المبلغ (ريال)</th>
                    <th className="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {laborByDept.map(dept => (
                    <>
                      {dept.rows.map((r, idx) => (
                        <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                          {idx === 0 && (
                            <td rowSpan={dept.rows.length} className="px-4 py-3 align-top">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${deptColor(r.department)}`}>
                                {deptLabel(r.department)}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 text-gray-800">{r.description}</td>
                          <td className="px-4 py-3 text-left font-mono font-semibold text-blue-700">
                            {r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-left">
                            <button onClick={() => deleteItem('labor_costs', r.id, loadLabor)} disabled={deleting === r.id}
                              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">حذف</button>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td className="px-4 py-2 text-xs text-gray-500 text-right" colSpan={2}>
                          مجموع {deptLabel(dept.value)}
                        </td>
                        <td className="px-4 py-2 text-left font-mono text-sm font-bold text-blue-700">
                          {dept.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td />
                      </tr>
                    </>
                  ))}
                  <tr className="bg-blue-50 border-t-2 border-blue-200">
                    <td className="px-4 py-3 font-semibold text-blue-800" colSpan={2}>الإجمالي</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-blue-800 text-base">
                      {totalLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Overhead Tab ── */}
      {tab === 'overhead' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">إضافة تكلفة ثابتة</p>
            <div className="flex gap-3 flex-wrap">
              <select value={ovCat} onChange={e => setOvCat(e.target.value as OverheadCategory)} className={inputCls}>
                {OVERHEAD_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input type="text" placeholder="الوصف (مثال: إيجار المطعم)"
                value={ovDesc} onChange={e => setOvDesc(e.target.value)}
                className={`${inputCls} flex-1 min-w-40`} />
              <input type="number" placeholder="المبلغ (ريال)"
                value={ovAmt} onChange={e => setOvAmt(e.target.value)}
                className={`${inputCls} w-40`} min={0} />
              <button onClick={addOverhead} disabled={addingOv || !ovDesc.trim() || !ovAmt}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg font-medium disabled:opacity-40 transition-colors">
                {addingOv ? '...' : '+ إضافة'}
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {overhead.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">لا توجد تكاليف ثابتة لهذا الشهر</div>
            ) : (
              <table suppressHydrationWarning className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                    <th className="text-right px-4 py-2.5 font-medium">التصنيف</th>
                    <th className="text-right px-4 py-2.5 font-medium">الوصف</th>
                    <th className="text-left px-4 py-2.5 font-medium">المبلغ (ريال)</th>
                    <th className="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {overhead.map(r => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${OVERHEAD_COLORS[r.category] ?? 'bg-gray-100 text-gray-700'}`}>
                          {OVERHEAD_CATS.find(c => c.value === r.category)?.label ?? r.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">{r.description}</td>
                      <td className="px-4 py-3 text-left font-mono font-semibold text-amber-700">
                        {r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <button onClick={() => deleteItem('overhead_costs', r.id, loadOverhead)} disabled={deleting === r.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">حذف</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50 border-t-2 border-amber-200">
                    <td className="px-4 py-3 font-semibold text-amber-800" colSpan={2}>الإجمالي</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-amber-800 text-base">
                      {totalOverhead.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Budget Tab ── */}
      {tab === 'budget' && (
        <div className="space-y-5">
          {/* Budget form */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-800 mb-4">أهداف {formatYearMonth(month)}</p>
            <div className="grid grid-cols-2 gap-4">
              {([
                { key: 'revenue',      label: 'الإيراد المستهدف (ريال)', placeholder: '0', suffix: 'ر.س' },
                { key: 'fc_pct',       label: 'FC% المستهدف',            placeholder: '30', suffix: '%' },
                { key: 'labor_pct',    label: 'العمالة% المستهدفة',      placeholder: '20', suffix: '%' },
                { key: 'overhead_pct', label: 'ثابتة% المستهدفة',        placeholder: '15', suffix: '%' },
              ] as { key: keyof typeof budgetForm; label: string; placeholder: string; suffix: string }[]).map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={f.suffix === '%' ? 100 : undefined} step="0.1"
                      placeholder={f.placeholder} value={budgetForm[f.key]}
                      onChange={e => setBudgetForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className={`${inputCls} flex-1`} />
                    <span className="text-sm text-gray-500 w-8">{f.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={saveBudget} disabled={savingBudget}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium disabled:opacity-40 transition-colors">
                {savingBudget ? 'جارٍ الحفظ...' : budget ? 'تحديث الميزانية' : 'حفظ الميزانية'}
              </button>
              {budgetMsg && (
                <span className={`text-sm ${budgetMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{budgetMsg.text}</span>
              )}
            </div>
          </div>

          {/* Actual vs Budget comparison */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">الفعلي مقارنةً بالميزانية</p>
                <span className="text-xs text-gray-400">الإيراد الفعلي: {actualRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س</span>
              </div>
            </div>
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
                  <th className="text-right px-4 py-2.5 font-medium">البند</th>
                  <th className="text-left px-4 py-2.5 font-medium">الفعلي</th>
                  <th className="text-left px-4 py-2.5 font-medium">الميزانية</th>
                  <th className="text-left px-4 py-2.5 font-medium">الفرق</th>
                </tr>
              </thead>
              <tbody>
                <BudgetRow
                  label="الإيراد"
                  actual={actualRevenue}
                  target={budget?.revenue_target ?? null}
                  isAmount
                  invertGood={false}
                />
                <BudgetRow
                  label="تكاليف العمالة %"
                  actual={laborPctActual}
                  target={budget?.labor_pct_target ?? null}
                  invertGood={true}
                />
                <BudgetRow
                  label="التكاليف الثابتة %"
                  actual={overheadPctActual}
                  target={budget?.overhead_pct_target ?? null}
                  invertGood={true}
                />
                {actualRevenue > 0 && budget?.fc_pct_target && (
                  <tr className="border-b border-gray-100 bg-blue-50">
                    <td className="px-4 py-3 text-sm text-blue-700 font-medium" colSpan={4}>
                      FC% الفعلي — راجع تقرير P&L لحسابه (يتطلب بيانات الانفجار)
                    </td>
                  </tr>
                )}
                {actualRevenue > 0 && (
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">إجمالي العمالة + الثابتة %</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-gray-800">
                      {(laborPctActual + overheadPctActual).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-left font-mono text-gray-500">
                      {budget?.labor_pct_target && budget?.overhead_pct_target
                        ? ((budget.labor_pct_target) + (budget.overhead_pct_target)).toFixed(1) + '%'
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {budget?.labor_pct_target && budget?.overhead_pct_target && (() => {
                        const target = budget.labor_pct_target! + budget.overhead_pct_target!
                        const actual = laborPctActual + overheadPctActual
                        const diff = actual - target
                        return (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${diff < 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                          </span>
                        )
                      })()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {actualRevenue === 0 && (
              <div className="p-6 text-center text-gray-400 text-sm">
                لا توجد مبيعات مسجّلة لهذا الشهر — استورد المبيعات أولاً لعرض المقارنة
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

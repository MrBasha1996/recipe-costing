'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { getCurrentYearMonth, lastNMonths, formatYearMonth } from '@/lib/period'
import type { LaborCost, OverheadCost, OverheadCategory } from '@/types'

type Tab = 'labor' | 'overhead'

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

export default function CostsPage() {
  const { brand } = useBrandStore()
  const { profile } = useUserStore()
  const months = lastNMonths(12)
  const [tab, setTab] = useState<Tab>('labor')
  const [month, setMonth] = useState(getCurrentYearMonth())

  // Labor
  const [labor, setLabor] = useState<LaborCost[]>([])
  const [laborDesc, setLaborDesc] = useState('')
  const [laborAmt, setLaborAmt] = useState('')
  const [addingLabor, setAddingLabor] = useState(false)

  // Overhead
  const [overhead, setOverhead] = useState<OverheadCost[]>([])
  const [ovCat, setOvCat] = useState<OverheadCategory>('rent')
  const [ovDesc, setOvDesc] = useState('')
  const [ovAmt, setOvAmt] = useState('')
  const [addingOv, setAddingOv] = useState(false)

  const [deleting, setDeleting] = useState<string | null>(null)

  const loadLabor = useCallback(async () => {
    const supabase = createClient()
    const { data } = await (supabase.from('labor_costs') as any)
      .select('*').eq('brand_id', brand).eq('month', month).order('created_at')
    setLabor((data as LaborCost[]) || [])
  }, [brand, month])

  const loadOverhead = useCallback(async () => {
    const supabase = createClient()
    const { data } = await (supabase.from('overhead_costs') as any)
      .select('*').eq('brand_id', brand).eq('month', month).order('category')
    setOverhead((data as OverheadCost[]) || [])
  }, [brand, month])

  useEffect(() => { loadLabor(); loadOverhead() }, [loadLabor, loadOverhead])

  async function addLabor() {
    if (!laborDesc.trim() || !laborAmt) return
    setAddingLabor(true)
    const supabase = createClient()
    await (supabase.from('labor_costs') as any).insert({
      brand_id: brand, month, description: laborDesc.trim(),
      amount: parseFloat(laborAmt), created_by: profile?.id ?? null,
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

  async function deleteItem(table: string, id: string, reload: () => void) {
    setDeleting(id)
    const supabase = createClient()
    await (supabase.from(table) as any).delete().eq('id', id)
    setDeleting(null)
    reload()
  }

  const totalLabor = labor.reduce((s, r) => s + r.amount, 0)
  const totalOverhead = overhead.reduce((s, r) => s + r.amount, 0)

  const [copying, setCopying] = useState(false)
  const [copyMsg, setCopyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function prevMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  }

  async function copyFromPrev() {
    setCopying(true); setCopyMsg(null)
    const supabase = createClient()
    const prev = prevMonth(month)
    const [{ data: prevLabor }, { data: prevOv }] = await Promise.all([
      (supabase.from('labor_costs') as any).select('description, amount').eq('brand_id', brand).eq('month', prev),
      (supabase.from('overhead_costs') as any).select('category, description, amount').eq('brand_id', brand).eq('month', prev),
    ])
    if ((!prevLabor?.length && !prevOv?.length)) {
      setCopyMsg({ ok: false, text: 'لا توجد بنود في الشهر السابق للنسخ منه' })
      setCopying(false); return
    }
    await Promise.all([
      prevLabor?.length ? (supabase.from('labor_costs') as any).insert(
        prevLabor.map((r: any) => ({ brand_id: brand, month, description: r.description, amount: r.amount, created_by: profile?.id ?? null }))
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
          <p className="text-gray-500 text-sm mt-0.5">تكاليف العمالة والتكاليف الثابتة</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {totalLabor === 0 && totalOverhead === 0 && (
            <button onClick={copyFromPrev} disabled={copying}
              className="text-sm px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium disabled:opacity-40 transition-colors whitespace-nowrap">
              {copying ? 'جارٍ النسخ...' : '📋 نسخ من الشهر السابق'}
            </button>
          )}
          <select
            value={month}
            onChange={e => { setMonth(e.target.value); setCopyMsg(null) }}
            className={inputCls}
          >
            {months.map(m => (
              <option key={m} value={m}>{formatYearMonth(m)}</option>
            ))}
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
          { label: 'تكاليف العمالة', value: totalLabor, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'التكاليف الثابتة', value: totalOverhead, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'إجمالي التكاليف الشهرية', value: totalLabor + totalOverhead, color: 'text-red-700', bg: 'bg-red-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 border border-gray-200`}>
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className={`text-xl font-bold font-mono ${c.color}`}>{c.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['labor', 'تكاليف العمالة'], ['overhead', 'التكاليف الثابتة']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === k ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Labor Tab */}
      {tab === 'labor' && (
        <div className="space-y-4">
          {/* Add form */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">إضافة بند عمالة</p>
            <div className="flex gap-3 flex-wrap">
              <input
                type="text"
                placeholder="الوصف (مثال: رواتب الطهاة)"
                value={laborDesc}
                onChange={e => setLaborDesc(e.target.value)}
                className={`${inputCls} flex-1 min-w-48`}
              />
              <input
                type="number"
                placeholder="المبلغ (ريال)"
                value={laborAmt}
                onChange={e => setLaborAmt(e.target.value)}
                className={`${inputCls} w-40`}
                min={0}
              />
              <button
                onClick={addLabor}
                disabled={addingLabor || !laborDesc.trim() || !laborAmt}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium disabled:opacity-40 transition-colors"
              >
                {addingLabor ? '...' : '+ إضافة'}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {labor.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">لا توجد بنود عمالة لهذا الشهر</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                    <th className="text-right px-4 py-2.5 font-medium">الوصف</th>
                    <th className="text-left px-4 py-2.5 font-medium">المبلغ (ريال)</th>
                    <th className="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {labor.map(r => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-800">{r.description}</td>
                      <td className="px-4 py-3 text-left font-mono font-semibold text-blue-700">{r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-left">
                        <button onClick={() => deleteItem('labor_costs', r.id, loadLabor)} disabled={deleting === r.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">حذف</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50 border-t-2 border-blue-200">
                    <td className="px-4 py-3 font-semibold text-blue-800">الإجمالي</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-blue-800 text-base">{totalLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Overhead Tab */}
      {tab === 'overhead' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">إضافة تكلفة ثابتة</p>
            <div className="flex gap-3 flex-wrap">
              <select value={ovCat} onChange={e => setOvCat(e.target.value as OverheadCategory)} className={inputCls}>
                {OVERHEAD_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input
                type="text"
                placeholder="الوصف (مثال: إيجار المطعم)"
                value={ovDesc}
                onChange={e => setOvDesc(e.target.value)}
                className={`${inputCls} flex-1 min-w-40`}
              />
              <input
                type="number"
                placeholder="المبلغ (ريال)"
                value={ovAmt}
                onChange={e => setOvAmt(e.target.value)}
                className={`${inputCls} w-40`}
                min={0}
              />
              <button
                onClick={addOverhead}
                disabled={addingOv || !ovDesc.trim() || !ovAmt}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg font-medium disabled:opacity-40 transition-colors"
              >
                {addingOv ? '...' : '+ إضافة'}
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {overhead.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">لا توجد تكاليف ثابتة لهذا الشهر</div>
            ) : (
              <table className="w-full text-sm">
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
                      <td className="px-4 py-3 text-left font-mono font-semibold text-amber-700">{r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-left">
                        <button onClick={() => deleteItem('overhead_costs', r.id, loadOverhead)} disabled={deleting === r.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">حذف</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50 border-t-2 border-amber-200">
                    <td className="px-4 py-3 font-semibold text-amber-800" colSpan={2}>الإجمالي</td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-amber-800 text-base">{totalOverhead.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

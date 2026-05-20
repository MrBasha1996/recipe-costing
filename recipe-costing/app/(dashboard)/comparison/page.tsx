'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { FC_TARGET } from '@/lib/calculations'
import type { Recipe } from '@/types'

type SortKey = 'product_name' | 'food_cost_pct' | 'dine_out_food_cost_pct' | 'avg_fc' | 'margin' | 'dine_out_margin'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'ok' | 'over'

function fcClass(pct: number | null): string {
  if (pct == null || pct === 0) return 'text-gray-400'
  if (pct <= FC_TARGET) return 'text-green-600'
  if (pct <= 45) return 'text-amber-600'
  return 'text-red-600'
}

function recipeStatus(r: Recipe): 'ok' | 'warning' | 'over' {
  const di = r.food_cost_pct ?? 0
  const doP = r.dine_out_food_cost_pct ?? di
  const max = Math.max(di, doP)
  if (max > 45) return 'over'
  if (max > FC_TARGET) return 'warning'
  return 'ok'
}

export default function ComparisonPage() {
  const { brand } = useBrandStore()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('food_cost_pct')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await (supabase.from('recipes') as any)
        .select('*')
        .eq('brand_id', brand as string)
        .order('food_cost_pct', { ascending: false })
      setRecipes((data as Recipe[]) || [])
      setLoading(false)
    }
    load()
  }, [brand])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const processed = useMemo(() => {
    let list = recipes.map(r => ({
      ...r,
      avg_fc: ((r.food_cost_pct ?? 0) + (r.dine_out_food_cost_pct ?? r.food_cost_pct ?? 0)) / 2,
    }))

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.product_name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'all') {
      list = list.filter(r => {
        const s = recipeStatus(r)
        if (statusFilter === 'ok') return s === 'ok'
        if (statusFilter === 'over') return s === 'over' || s === 'warning'
        return true
      })
    }

    list.sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0
      const bv = (b as any)[sortKey] ?? 0
      const cmp = typeof av === 'string'
        ? av.localeCompare(bv, 'ar')
        : av - bv
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [recipes, search, statusFilter, sortKey, sortDir])

  const overTarget = recipes.filter(r => recipeStatus(r) !== 'ok').length

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k
    return (
      <th
        onClick={() => handleSort(k)}
        className={`px-4 py-3 text-xs font-medium cursor-pointer select-none whitespace-nowrap transition-colors hover:text-gray-900 ${
          active ? 'text-gray-900' : 'text-gray-500'
        }`}
      >
        {label}
        <span className="mr-1 text-gray-400">
          {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </th>
    )
  }

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">مقارنة التكاليف</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {recipes.length} وصفة محفوظة
            {overTarget > 0 && (
              <span className="text-red-500 mr-2">· {overTarget} فوق الهدف</span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="بحث بالاسم أو SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-56"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {([['all', 'الكل'], ['ok', 'ضمن الهدف'], ['over', 'فوق الهدف']] as [StatusFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{processed.length} نتيجة</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">جارٍ التحميل...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-right bg-gray-50">
                  <SortTh label="المنتج" k="product_name" />
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">SKU</th>
                  <SortTh label="DI FC%" k="food_cost_pct" />
                  <SortTh label="DO FC%" k="dine_out_food_cost_pct" />
                  <SortTh label="متوسط FC%" k="avg_fc" />
                  <SortTh label="هامش DI" k="margin" />
                  <SortTh label="هامش DO" k="dine_out_margin" />
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {processed.map(r => {
                  const status = recipeStatus(r)
                  const doPct = r.dine_out_food_cost_pct
                  const doMargin = r.dine_out_margin
                  return (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.product_name}</div>
                        {r.is_semi && <div className="text-xs text-purple-600">Batch</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{r.sku}</td>
                      <td className={`px-4 py-3 font-mono font-bold text-center ${fcClass(r.food_cost_pct)}`}>
                        {r.food_cost_pct?.toFixed(1)}%
                      </td>
                      <td className={`px-4 py-3 font-mono font-bold text-center ${fcClass(doPct ?? null)}`}>
                        {doPct && doPct > 0 ? `${doPct.toFixed(1)}%` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-4 py-3 font-mono font-bold text-center ${fcClass(r.avg_fc)}`}>
                        {r.avg_fc.toFixed(1)}%
                      </td>
                      <td className={`px-4 py-3 font-mono text-center ${r.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {r.margin?.toFixed(2)} ر.س
                      </td>
                      <td className={`px-4 py-3 font-mono text-center ${(doMargin ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {doMargin && doMargin !== 0 ? `${doMargin.toFixed(2)} ر.س` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          status === 'ok'
                            ? 'bg-green-50 text-green-700'
                            : status === 'warning'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {status === 'ok' ? '✓ ضمن الهدف' : status === 'warning' ? '⚠ تحذير' : '✗ فوق الهدف'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {processed.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                      لا توجد وصفات محفوظة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="text-green-600">● ضمن الهدف ≤{FC_TARGET}%</span>
        <span className="text-amber-600">● تحذير {FC_TARGET}–45%</span>
        <span className="text-red-600">● فوق الهدف &gt;45%</span>
      </div>
    </div>
  )
}

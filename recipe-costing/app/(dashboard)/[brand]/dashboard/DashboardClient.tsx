'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { FC_TARGET } from '@/lib/calculations'
import KPICards from '@/components/dashboard/KPICards'
import OverTargetTable from '@/components/dashboard/OverTargetTable'
const FCDistributionChart = dynamic(() => import('@/components/dashboard/FCDistributionChart'), { ssr: false })
const Top10Chart = dynamic(() => import('@/components/dashboard/Top10Chart'), { ssr: false })
import type { Recipe, BrandId } from '@/types'

type DashTab = 'ops' | 'recipes'

interface OpsData {
  revYest: number; qtyYest: number
  revLastWeek: number; qtyLastWeek: number
  fcWeek: number
  lowStockCount: number; emptyStockCount: number
  expiringCount: number; expiredCount: number
  inventoryValue: number
  wasteValue7d: number
  top5: { name: string; qty: number; revenue: number }[]
  batchesLow: { ing_sku: string; ing_name: string; current_qty: number }[]
  fetchedAt: string
}

interface Props {
  recipes: Recipe[]
  opsData: OpsData
  brand: BrandId
  fcLow: number
  fcHigh: number
}

export default function DashboardClient({ recipes, opsData, brand, fcLow, fcHigh }: Props) {
  const router     = useRouter()
  const [tab, setTab]         = useState<DashTab>('ops')
  const [exporting, setExporting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const avgFC      = recipes.length ? recipes.reduce((s, r) => s + r.food_cost_pct, 0) / recipes.length : 0
  const overTarget = recipes.filter(r => r.food_cost_pct > FC_TARGET)
  const avgMargin  = recipes.length ? recipes.reduce((s, r) => s + r.margin, 0) / recipes.length : 0
  const distribution = [
    { range: '0–25%',  count: recipes.filter(r => r.food_cost_pct < 25).length,                          color: '#22c55e' },
    { range: '25–30%', count: recipes.filter(r => r.food_cost_pct >= 25 && r.food_cost_pct < 30).length, color: '#86efac' },
    { range: '30–35%', count: recipes.filter(r => r.food_cost_pct >= 30 && r.food_cost_pct < 35).length, color: '#fbbf24' },
    { range: '35–40%', count: recipes.filter(r => r.food_cost_pct >= 35 && r.food_cost_pct < 40).length, color: '#f97316' },
    { range: '40–45%', count: recipes.filter(r => r.food_cost_pct >= 40 && r.food_cost_pct < 45).length, color: '#ef4444' },
    { range: '45%+',   count: recipes.filter(r => r.food_cost_pct >= 45).length,                         color: '#7f1d1d' },
  ]

  async function handleExport() {
    setExporting(true)
    try {
      const supabase = createClient()
      const [{ data: recipeIngs }, { data: history }] = await Promise.all([
        (supabase.from('recipe_ingredients') as any)
          .select('*, recipes!inner(sku, product_name, brand_id)').eq('recipes.brand_id', brand as string),
        (supabase.from('price_history') as any)
          .select('*').eq('brand_id', brand as string).order('changed_at', { ascending: false }).limit(500),
      ])
      const ingExport = ((recipeIngs as any[]) || []).map((ri: any) => ({
        recipe_sku: ri.recipes?.sku ?? '', recipe_name: ri.recipes?.product_name ?? '',
        ing_sku: ri.ing_sku, ing_name: ri.ing_name, qty: ri.qty, unit: ri.unit,
        unit_cost: ri.unit_cost, yield_pct: ri.yield_pct,
        line_cost: ri.qty > 0 && ri.yield_pct > 0 ? (ri.qty / (ri.yield_pct / 100)) * ri.unit_cost : 0,
      }))
      const { exportRecipesExcel } = await import('@/lib/excel')
      await exportRecipesExcel(recipes, ingExport, (history as any[]) || [])
    } finally { setExporting(false) }
  }

  async function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1500)
  }

  const revDiff   = opsData.revLastWeek > 0 ? ((opsData.revYest - opsData.revLastWeek) / opsData.revLastWeek) * 100 : null
  const alertCount = opsData.lowStockCount + opsData.emptyStockCount + opsData.expiringCount + opsData.expiredCount

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">لوحة التحكم</h1>
          <p className="text-gray-500 text-sm mt-0.5">{recipes.length} وصفة محفوظة</p>
        </div>
        {tab === 'recipes' && (
          <button onClick={handleExport} disabled={exporting || recipes.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {exporting ? 'جارٍ التصدير...' : '⬇ تصدير Excel'}
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button onClick={() => setTab('ops')}
          className={`px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'ops' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          نبض التشغيل
        </button>
        <button onClick={() => setTab('recipes')}
          className={`px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'recipes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          هندسة الوصفات
        </button>
      </div>

      {/* ── Tab: نبض التشغيل ─────────────────────────────────────── */}
      {tab === 'ops' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">آخر تحديث: {new Date(opsData.fetchedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</p>
            <button onClick={handleRefresh} disabled={refreshing} className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40">
              {refreshing ? 'جارٍ التحديث...' : 'تحديث ↻'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">مبيعات الأمس (قبل VAT)</div>
              <div className="text-2xl font-bold font-mono text-blue-700">
                {opsData.revYest > 0 ? `${opsData.revYest.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'} <span className="text-sm font-normal">ر.س</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-gray-400">{opsData.qtyYest} وجبة</span>
                {revDiff != null && (
                  <span className={`text-xs font-semibold mr-2 ${revDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {revDiff >= 0 ? '↑' : '↓'} {Math.abs(revDiff).toFixed(1)}% عن الأسبوع الماضي
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">FC% نظري (آخر 7 أيام)</div>
              <div className={`text-2xl font-bold font-mono ${opsData.fcWeek > 0 ? (opsData.fcWeek <= fcLow ? 'text-green-600' : opsData.fcWeek <= fcHigh ? 'text-amber-600' : 'text-red-600') : 'text-gray-300'}`}>
                {opsData.fcWeek > 0 ? `${opsData.fcWeek.toFixed(1)}%` : '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {opsData.fcWeek > 0 && opsData.fcWeek <= fcLow ? 'ممتاز' : opsData.fcWeek <= fcHigh ? 'مقبول' : opsData.fcWeek > 0 ? 'مرتفع — راجع التكاليف' : 'لا توجد مبيعات'}
              </div>
            </div>

            <Link href={`/${brand}/inventory`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors block">
              <div className="text-xs text-gray-500 mb-1">مواد تحت الحد الأدنى</div>
              <div className={`text-2xl font-bold font-mono ${opsData.emptyStockCount > 0 ? 'text-red-600' : opsData.lowStockCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {opsData.emptyStockCount + opsData.lowStockCount}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {opsData.emptyStockCount > 0 && <span className="text-red-500 font-semibold">{opsData.emptyStockCount} نفدت · </span>}
                {opsData.lowStockCount > 0 && <span className="text-amber-600">{opsData.lowStockCount} منخفضة</span>}
                {opsData.emptyStockCount === 0 && opsData.lowStockCount === 0 && 'المخزون جيد ✓'}
              </div>
            </Link>

            <Link href={`/${brand}/inventory`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors block">
              <div className="text-xs text-gray-500 mb-1">تنبيهات الصلاحية</div>
              <div className={`text-2xl font-bold font-mono ${opsData.expiredCount > 0 ? 'text-red-600' : opsData.expiringCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {opsData.expiredCount + opsData.expiringCount}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {opsData.expiredCount > 0 && <span className="text-red-500 font-semibold">{opsData.expiredCount} منتهية · </span>}
                {opsData.expiringCount > 0 && <span className="text-amber-600">{opsData.expiringCount} تنتهي ≤3 أيام</span>}
                {opsData.expiredCount === 0 && opsData.expiringCount === 0 && 'لا تنبيهات ✓'}
              </div>
            </Link>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">قيمة المخزون الحالي</div>
              <div className="text-2xl font-bold font-mono text-indigo-700">
                {opsData.inventoryValue > 0 ? `${opsData.inventoryValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'} <span className="text-sm font-normal">ر.س</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">رأس المال المخزني</div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">قيمة الهدر (آخر 7 أيام)</div>
              <div className={`text-2xl font-bold font-mono ${opsData.wasteValue7d > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {opsData.wasteValue7d > 0 ? `${opsData.wasteValue7d.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '٠'} <span className="text-sm font-normal">ر.س</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">{opsData.wasteValue7d === 0 ? 'لا هدر مسجّل ✓' : 'مسجّل في صفحة الهدر'}</div>
            </div>

            <Link href={`/${brand}/production`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors block">
              <div className="text-xs text-gray-500 mb-1">باتشات نفدت (تحتاج إنتاج)</div>
              <div className={`text-2xl font-bold font-mono ${opsData.batchesLow.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>{opsData.batchesLow.length}</div>
              <div className="text-xs text-gray-400 mt-1">
                {opsData.batchesLow.length > 0
                  ? opsData.batchesLow.slice(0, 2).map(b => b.ing_name).join('، ') + (opsData.batchesLow.length > 2 ? '...' : '')
                  : 'جميع الباتشات متوفرة ✓'}
              </div>
            </Link>

            <Link href={`/${brand}/inventory`} className={`rounded-xl p-4 hover:opacity-90 transition-opacity block border ${alertCount > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <div className={`text-xs mb-1 ${alertCount > 0 ? 'text-red-600' : 'text-green-600'}`}>إجمالي التنبيهات</div>
              <div className={`text-2xl font-bold font-mono ${alertCount > 0 ? 'text-red-700' : 'text-green-700'}`}>{alertCount}</div>
              <div className={`text-xs mt-1 ${alertCount > 0 ? 'text-red-500' : 'text-green-600'}`}>
                {alertCount > 0 ? 'يحتاج انتباه — اضغط للمراجعة' : 'النظام سليم ✓'}
              </div>
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <span className="font-semibold text-gray-900 text-sm">أعلى 5 منتجات إيراداً — الأمس</span>
              </div>
              {opsData.top5.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">لا توجد مبيعات مسجّلة للأمس</div>
              ) : (
                <table suppressHydrationWarning className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
                      <th className="text-right px-4 py-2 font-medium">#</th>
                      <th className="text-right px-4 py-2 font-medium">المنتج</th>
                      <th className="text-center px-4 py-2 font-medium">الكمية</th>
                      <th className="text-left px-4 py-2 font-medium">الإيراد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opsData.top5.map((p, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900 text-xs">{p.name}</td>
                        <td className="px-4 py-2.5 text-center font-mono text-gray-600 text-xs">{p.qty}</td>
                        <td className="px-4 py-2.5 text-left font-mono font-semibold text-green-700 text-xs">
                          {p.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">باتشات تحتاج إنتاج اليوم</span>
                <Link href={`/${brand}/production`} className="text-xs text-blue-600 hover:text-blue-800">اذهب للإنتاج →</Link>
              </div>
              {opsData.batchesLow.length === 0 ? (
                <div className="px-4 py-8 text-center text-green-600 text-sm">جميع الباتشات متوفرة ✓</div>
              ) : (
                <table suppressHydrationWarning className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
                      <th className="text-right px-4 py-2 font-medium">الباتش</th>
                      <th className="text-center px-4 py-2 font-medium">المخزون</th>
                      <th className="text-center px-4 py-2 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opsData.batchesLow.map((b, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900 text-xs">{b.ing_name}</div>
                          <div className="text-xs text-gray-400 font-mono">{b.ing_sku}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono text-red-600 font-semibold text-xs">{b.current_qty}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">نفد</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: هندسة الوصفات ───────────────────────────────────── */}
      {tab === 'recipes' && (
        recipes.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
            لا توجد وصفات محفوظة — ابدأ بحفظ وصفة من صفحة الوصفات
          </div>
        ) : (
          <>
            <KPICards avgFC={avgFC} overTargetCount={overTarget.length} totalRecipes={recipes.length} avgMargin={avgMargin} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FCDistributionChart data={distribution} />
              <Top10Chart recipes={[...recipes].sort((a, b) => b.food_cost_pct - a.food_cost_pct).slice(0, 10)} />
            </div>
            {overTarget.length > 0 && <OverTargetTable recipes={overTarget} />}
          </>
        )
      )}
    </div>
  )
}

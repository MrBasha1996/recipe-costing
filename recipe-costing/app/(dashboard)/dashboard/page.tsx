'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { FC_TARGET } from '@/lib/calculations'
import { qc, cacheKey } from '@/lib/queryCache'
import KPICards from '@/components/dashboard/KPICards'
import FCDistributionChart from '@/components/dashboard/FCDistributionChart'
import Top10Chart from '@/components/dashboard/Top10Chart'
import OverTargetTable from '@/components/dashboard/OverTargetTable'
import { exportRecipesExcel } from '@/lib/excel'
import type { Recipe } from '@/types'

export default function DashboardPage() {
  const { brand } = useBrandStore()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    const rk = cacheKey.recipes(brand)
    const cached = qc.get<Recipe[]>(rk)
    if (cached) { setRecipes(cached); setLoading(false); return }

    setLoading(true)
    const supabase = createClient()
    const { data } = await (supabase.from('recipes') as any)
      .select('*')
      .eq('brand_id', brand as string)
      .order('food_cost_pct', { ascending: false })
    const recipes = (data as Recipe[]) || []
    qc.set(rk, recipes)
    setRecipes(recipes)
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  async function handleExport() {
    setExporting(true)
    try {
      const supabase = createClient()

      // Load recipe ingredients for all recipes
      const [{ data: recipeIngs }, { data: history }] = await Promise.all([
        (supabase.from('recipe_ingredients') as any)
          .select('*, recipes!inner(sku, product_name, brand_id)')
          .eq('recipes.brand_id', brand as string),
        (supabase.from('price_history') as any)
          .select('*')
          .eq('brand_id', brand as string)
          .order('changed_at', { ascending: false })
          .limit(500),
      ])

      const ingExport = ((recipeIngs as any[]) || []).map((ri: any) => ({
        recipe_sku: ri.recipes?.sku ?? '',
        recipe_name: ri.recipes?.product_name ?? '',
        ing_sku: ri.ing_sku,
        ing_name: ri.ing_name,
        qty: ri.qty,
        unit: ri.unit,
        unit_cost: ri.unit_cost,
        yield_pct: ri.yield_pct,
        line_cost: ri.qty > 0 && ri.yield_pct > 0
          ? (ri.qty / (ri.yield_pct / 100)) * ri.unit_cost
          : 0,
      }))

      await exportRecipesExcel(recipes, ingExport, (history as any[]) || [])
    } finally {
      setExporting(false)
    }
  }

  const avgFC = recipes.length
    ? recipes.reduce((s, r) => s + r.food_cost_pct, 0) / recipes.length
    : 0
  const overTarget = recipes.filter(r => r.food_cost_pct > FC_TARGET)
  const avgMargin = recipes.length
    ? recipes.reduce((s, r) => s + r.margin, 0) / recipes.length
    : 0

  const distribution = [
    { range: '0–25%',  count: recipes.filter(r => r.food_cost_pct < 25).length,                                   color: '#22c55e' },
    { range: '25–30%', count: recipes.filter(r => r.food_cost_pct >= 25 && r.food_cost_pct < 30).length,          color: '#86efac' },
    { range: '30–35%', count: recipes.filter(r => r.food_cost_pct >= 30 && r.food_cost_pct < 35).length,          color: '#fbbf24' },
    { range: '35–40%', count: recipes.filter(r => r.food_cost_pct >= 35 && r.food_cost_pct < 40).length,          color: '#f97316' },
    { range: '40–45%', count: recipes.filter(r => r.food_cost_pct >= 40 && r.food_cost_pct < 45).length,          color: '#ef4444' },
    { range: '45%+',   count: recipes.filter(r => r.food_cost_pct >= 45).length,                                   color: '#7f1d1d' },
  ]

  const top10 = recipes.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">لوحة التحكم</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'جارٍ التحميل...' : `${recipes.length} وصفة محفوظة`}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || recipes.length === 0}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {exporting ? 'جارٍ التصدير...' : '⬇ تصدير Excel'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">جارٍ التحميل...</div>
      ) : recipes.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          لا توجد وصفات محفوظة — ابدأ بحفظ وصفة من صفحة الوصفات
        </div>
      ) : (
        <>
          <KPICards
            avgFC={avgFC}
            overTargetCount={overTarget.length}
            totalRecipes={recipes.length}
            avgMargin={avgMargin}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FCDistributionChart data={distribution} />
            <Top10Chart recipes={top10} />
          </div>

          {overTarget.length > 0 && (
            <OverTargetTable recipes={overTarget} />
          )}
        </>
      )}
    </div>
  )
}

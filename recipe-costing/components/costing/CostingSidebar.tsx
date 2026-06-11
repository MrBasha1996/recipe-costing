'use client'

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { FC_TARGET, calcServiceCost } from '@/lib/calculations'
import { qc, cacheKey } from '@/lib/queryCache'
import { useCostingStore } from '@/stores/costingStore'
import type { Product, BatchProduct, Recipe, BrandId } from '@/types'

interface Props {
  brand: BrandId
  selectedSku: string | null
  onSelect: (p: Product) => void
  mode: 'meals' | 'batches'
}

type Filter = 'all' | 'saved' | 'unsaved'

export default function CostingSidebar({ brand, selectedSku, onSelect, mode }: Props) {
  const { isManagement, canEdit } = useUserStore()
  const { triggerReload } = useCostingStore()
  const isMgmt = isManagement()
  const canE = canEdit()
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<BatchProduct[]>([])
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportingIng, setExportingIng] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // useSyncExternalStore: الحل الرسمي لاختلاف server/client — لا يُطلق hydration error
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false)

  useEffect(() => {
    if (isMgmt) setFilter('saved')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async (force = false) => {
    const rk = mode === 'meals' ? cacheKey.recipes(brand) : cacheKey.batchRecipes(brand)
    const cachedRecs = !force && qc.get<Recipe[]>(rk)

    if (mode === 'meals') {
      const pk = cacheKey.products(brand)
      const cachedProds = !force && qc.get<Product[]>(pk)
      if (cachedProds && cachedRecs) {
        setProducts(cachedProds)
        const recMap: Record<string, Recipe> = {}
        cachedRecs.forEach(r => { recMap[r.sku] = r })
        setRecipes(recMap)
        setLoading(false)
        return
      }
      setLoading(true)
      const supabase = createClient()
      const [{ data: prods }, { data: recs }] = await Promise.all([
        supabase.from('products').select('*').eq('brand_id', brand).order('name'),
        cachedRecs ? Promise.resolve({ data: cachedRecs }) : supabase.from('recipes').select('*').eq('brand_id', brand).eq('is_semi', false),
      ])
      const prodList = (prods as Product[]) || []
      const recList  = (recs  as Recipe[])  || []
      qc.set(pk, prodList)
      qc.set(rk, recList)
      setProducts(prodList)
      const recMap: Record<string, Recipe> = {}
      recList.forEach(r => { recMap[r.sku] = r })
      setRecipes(recMap)
    } else {
      const bk = `batches:${brand}`
      const cachedBatches = !force && qc.get<BatchProduct[]>(bk)
      if (cachedBatches && cachedRecs) {
        setBatches(cachedBatches)
        const recMap: Record<string, Recipe> = {}
        cachedRecs.forEach(r => { recMap[r.sku] = r })
        setRecipes(recMap)
        setLoading(false)
        return
      }
      setLoading(true)
      const supabase = createClient()
      const [{ data: batchData }, { data: recs }] = await Promise.all([
        (supabase.from('batches') as any).select('*').eq('brand_id', brand).order('name'),
        cachedRecs ? Promise.resolve({ data: cachedRecs }) : (supabase.from('recipes') as any).select('*').eq('brand_id', brand).eq('is_semi', true),
      ])
      const batchList = (batchData as BatchProduct[]) || []
      const recList   = (recs     as Recipe[])         || []
      qc.set(bk, batchList)
      qc.set(rk, recList)
      setBatches(batchList)
      const recMap: Record<string, Recipe> = {}
      recList.forEach(r => { recMap[r.sku] = r })
      setRecipes(recMap)
    }
    setLoading(false)
  }, [brand, mode])

  useEffect(() => { load() }, [load])

  async function handleExport() {
    setExporting(true)
    try {
      const supabase = createClient()
      const isSemi = mode === 'batches'
      const { data } = await (supabase.from('recipes') as any)
        .select('product_name, sku, version, is_approved, yield_portions, sell_price, app_price, total_cost, food_cost_pct, margin, dine_out_total_cost, dine_out_food_cost_pct, dine_out_margin')
        .eq('brand_id', brand)
        .eq('is_semi', isSemi)
        .eq('is_active', true)
        .order('product_name')

      const rows = (data || []) as any[]
      const headers = [
        'اسم المنتج', 'SKU', 'إصدار', 'معتمدة', 'عدد الحصص',
        'سعر البيع', 'سعر التطبيق',
        'تكلفة كلية DI', 'FC% DI', 'هامش DI',
        'تكلفة كلية DO', 'FC% DO', 'هامش DO',
      ]
      const csvRows = rows.map(r => [
        r.product_name, r.sku, r.version ?? 1, r.is_approved ? 'نعم' : 'لا',
        r.yield_portions, r.sell_price, r.app_price ?? '',
        r.total_cost?.toFixed(4) ?? '', r.food_cost_pct?.toFixed(1) ?? '', r.margin?.toFixed(2) ?? '',
        r.dine_out_total_cost?.toFixed(4) ?? '', r.dine_out_food_cost_pct?.toFixed(1) ?? '', r.dine_out_margin?.toFixed(2) ?? '',
      ])
      const csv = [headers, ...csvRows]
        .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recipes-${brand}-${mode}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportAllIngredients() {
    setExportingIng(true)
    try {
      const supabase = createClient()
      const isSemi = mode === 'batches'
      const { data } = await (supabase.from('recipes') as any)
        .select('product_name, sku, recipe_ingredients(ing_name, ing_sku, unit, qty, yield_pct, unit_cost, section, service_type, sort_order)')
        .eq('brand_id', brand)
        .eq('is_semi', isSemi)
        .eq('is_active', true)
        .order('product_name')

      const recipeList = (data || []) as any[]
      const headers = [
        'اسم الوصفة', 'SKU الوصفة',
        'المكوّن', 'SKU المكوّن', 'الوحدة',
        'الكمية', 'Yield%', 'سعر الوحدة', 'الإجمالي',
        'القسم', 'نوع الخدمة',
      ]
      const csvRows: any[][] = []
      for (const rec of recipeList) {
        const ings = ((rec.recipe_ingredients || []) as any[])
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        for (const r of ings) {
          const total = r.yield_pct > 0 ? (r.qty / (r.yield_pct / 100)) * r.unit_cost : 0
          csvRows.push([
            rec.product_name, rec.sku,
            r.ing_name, r.ing_sku, r.unit,
            r.qty, r.yield_pct,
            r.unit_cost != null ? Number(r.unit_cost).toFixed(6) : '',
            total.toFixed(4),
            r.section, r.service_type,
          ])
        }
      }
      const csv = [headers, ...csvRows]
        .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ingredients-${brand}-${mode}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingIng(false)
    }
  }

  async function handleRecalcAll() {
    // Diagnostic: to find batches with a suspicious cost-per-portion (likely a
    // yield_portions unit mismatch), run this query in Supabase:
    // -- SELECT sku, total_cost, yield_portions, total_cost/yield_portions as unit_cost
    // -- FROM recipes WHERE is_semi=true AND is_active=true ORDER BY total_cost/yield_portions DESC
    if (!window.confirm(`إعادة احتساب تكاليف جميع وصفات ${mode === 'batches' ? 'الباتش' : 'المنتجات'} النشطة؟`)) return
    setRecalculating(true)
    setRecalcMsg(null)
    try {
      const supabase = createClient()
      const isSemi = mode === 'batches'

      // جلب الوصفات النشطة مع مكوناتها
      const { data: recs } = await (supabase.from('recipes') as any)
        .select('id, sell_price, app_price, yield_portions, recipe_ingredients(id, ing_sku, ing_name, qty, unit_cost, yield_pct, is_semi, section, service_type)')
        .eq('brand_id', brand)
        .eq('is_semi', isSemi)
        .eq('is_active', true)

      const recipeList = (recs || []) as any[]
      if (recipeList.length === 0) { setRecalcMsg({ ok: false, text: 'لا توجد وصفات نشطة' }); return }

      // تجميع SKUs المكونات
      const rmSkus = new Set<string>()
      const semiSkus = new Set<string>()
      // السعر المحفوظ والاسم لكل باتش لاكتشاف التغيّرات الكبيرة
      const savedBatchCost = new Map<string, number>()
      const batchName = new Map<string, string>()
      for (const rec of recipeList) {
        for (const ing of (rec.recipe_ingredients || [])) {
          if (ing.is_semi) {
            semiSkus.add(ing.ing_sku)
            if (ing.unit_cost != null && !savedBatchCost.has(ing.ing_sku)) savedBatchCost.set(ing.ing_sku, ing.unit_cost)
            if (ing.ing_name && !batchName.has(ing.ing_sku)) batchName.set(ing.ing_sku, ing.ing_name)
          } else rmSkus.add(ing.ing_sku)
        }
      }

      // جلب الأسعار الحالية
      const priceMap = new Map<string, number>()
      const [ingRes, batchRes] = await Promise.all([
        rmSkus.size > 0
          ? (supabase.from('ingredients') as any).select('sku, cost').eq('brand_id', brand).in('sku', [...rmSkus])
          : Promise.resolve({ data: [] }),
        semiSkus.size > 0
          ? (supabase.from('recipes') as any).select('sku, total_cost, yield_portions').eq('brand_id', brand).eq('is_semi', true).eq('is_active', true).in('sku', [...semiSkus])
          : Promise.resolve({ data: [] }),
      ])
      for (const ing of (ingRes.data || []) as any[]) priceMap.set(ing.sku, ing.cost)
      // اكتشاف الباتشات بتغيّر كبير في سعر الوحدة (>10×) مقارنة بالسعر المحفوظ
      const bigChanges: string[] = []
      for (const b of (batchRes.data || []) as any[]) {
        if (b.yield_portions > 0) {
          const newCost = b.total_cost / b.yield_portions
          priceMap.set(b.sku, newCost)
          const oldCost = savedBatchCost.get(b.sku)
          if (oldCost != null && oldCost > 0.001 && (newCost / oldCost > 10 || oldCost / newCost > 10)) {
            const name = batchName.get(b.sku) ?? b.sku
            bigChanges.push(`${name} (كان ${oldCost.toFixed(3)} → صار ${newCost.toFixed(3)})`)
          }
        }
      }

      // إعادة الاحتساب والتحديث
      let updated = 0

      for (const rec of recipeList) {
        const ings = (rec.recipe_ingredients || []).map((r: any) => ({
          ...r,
          unit_cost: priceMap.has(r.ing_sku) ? priceMap.get(r.ing_sku)! : r.unit_cost,
          section: r.section ?? 'food',
          service_type: r.service_type ?? 'both',
        }))
        const foodRows = ings.filter((r: any) => r.section === 'food')
        const diPkg    = ings.filter((r: any) => r.section === 'packaging' && r.service_type !== 'dine_out')
        const doPkg    = ings.filter((r: any) => r.section === 'packaging' && r.service_type !== 'dine_in')
        const diRes = calcServiceCost(foodRows, diPkg, rec.yield_portions, rec.sell_price, rec.app_price)
        const doRes = calcServiceCost(foodRows, doPkg, rec.yield_portions, rec.sell_price, rec.app_price)

        const { error: recErr } = await (supabase.from('recipes') as any).update({
          total_cost:              parseFloat(diRes.totalCost.toFixed(4)),
          food_cost_pct:           parseFloat(diRes.foodCostPct.toFixed(1)),
          margin:                  parseFloat(diRes.margin.toFixed(2)),
          margin_app:              diRes.marginApp != null ? parseFloat(diRes.marginApp.toFixed(2)) : null,
          dine_out_total_cost:     parseFloat(doRes.totalCost.toFixed(4)),
          dine_out_food_cost_pct:  parseFloat(doRes.foodCostPct.toFixed(1)),
          dine_out_margin:         parseFloat(doRes.margin.toFixed(2)),
        }).eq('id', rec.id)
        if (recErr) continue

        // تحديث unit_cost في recipe_ingredients لهذه الوصفة
        // نجمّع المكونات حسب السعر الجديد ونعمل update واحد لكل سعر فريد
        const ingsByNewCost = new Map<number, string[]>()
        for (const ing of ings) {
          const newCost = priceMap.get(ing.ing_sku)
          if (newCost !== undefined && ing.id) {
            const rounded = parseFloat(newCost.toFixed(6))
            if (!ingsByNewCost.has(rounded)) ingsByNewCost.set(rounded, [])
            ingsByNewCost.get(rounded)!.push(ing.id)
          }
        }
        for (const [cost, ids] of ingsByNewCost.entries()) {
          await (supabase.from('recipe_ingredients') as any)
            .update({ unit_cost: cost })
            .in('id', ids)
        }

        updated++
      }

      qc.bustPrefix(cacheKey.recipes(brand))
      qc.bustPrefix(cacheKey.batchRecipes(brand))
      qc.bust(cacheKey.ingPrices(brand))
      const successText = `تم تحديث ${updated} وصفة ✓`
      if (bigChanges.length > 0) {
        setRecalcMsg({ ok: false, text: `${successText} — ⚠ باتشات بتغيير كبير في السعر: ${bigChanges.join('، ')}` })
      } else {
        setRecalcMsg({ ok: true, text: successText })
      }
      triggerReload()
      await load(true)
    } catch (e: any) {
      setRecalcMsg({ ok: false, text: `خطأ: ${e.message}` })
    } finally {
      setRecalculating(false)
    }
  }

  function applyFilter<T extends { sku: string; name: string }>(items: T[]): T[] {
    let result = items
    if (filter === 'saved')   result = result.filter(p => !!recipes[p.sku])
    if (filter === 'unsaved') result = result.filter(p => !recipes[p.sku])
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.sku.includes(q))
    }
    return result
  }

  const filteredMeals   = applyFilter(products.filter(p => !p.is_semi))
  const filteredBatches = applyFilter(batches)

  const listCount  = mode === 'meals' ? filteredMeals.length : filteredBatches.length
  const savedCount = mode === 'meals'
    ? products.filter(p => !p.is_semi && !!recipes[p.sku]).length
    : batches.filter(b => !!recipes[b.sku]).length
  const overTarget = Object.values(recipes).filter(r => r.food_cost_pct > FC_TARGET).length

  function handleBatchSelect(b: BatchProduct) {
    const asProduct: Product = {
      sku: b.sku,
      brand_id: b.brand_id,
      name: b.name,
      category: 'Meal',
      price: 0,
      app_price: null,
      app_sku: null,
      unit: b.unit,
      is_base: false,
      is_semi: true,
      created_at: b.created_at,
    }
    onSelect(asProduct)
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-gray-100">
        {/* Mode tabs */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <Link
            href={`/${brand}/costing`}
            className={`flex-1 text-center text-xs py-2 font-medium transition-colors ${
              mode === 'meals'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            منتجات
          </Link>
          <Link
            href={`/${brand}/costing/batches`}
            className={`flex-1 text-center text-xs py-2 font-medium transition-colors border-r border-gray-200 ${
              mode === 'batches'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            باتش
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="بحث..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-50 border-0 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder-gray-400"
          />
        </div>

        {/* Stats + import row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{savedCount} محفوظة</span>
            {overTarget > 0 && (
              <span className="text-[11px] text-red-500">· {overTarget} فوق الهدف</span>
            )}
          </div>
          {isClient && !isMgmt && (
            <Link
              href={mode === 'meals' ? `/${brand}/costing/import` : `/${brand}/batches/import`}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              استيراد ↑
            </Link>
          )}
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            {exporting ? '...' : '↓ تصدير'}
          </button>
          <button
            onClick={handleExportAllIngredients}
            disabled={exportingIng}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            {exportingIng ? '...' : '↓ مكونات'}
          </button>
          {isClient && canE && (
            <button
              onClick={handleRecalcAll}
              disabled={recalculating}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
            >
              {recalculating ? '...' : '↻ إعادة احتساب'}
            </button>
          )}
          {isClient && recalcMsg && (
            <span className={`text-[11px] ${recalcMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
              {recalcMsg.text}
            </span>
          )}
        </div>

        {/* Filter tabs — hidden for management, deferred to avoid SSR mismatch */}
        {isClient && !isMgmt && (
          <div className="flex gap-0 border border-gray-200 rounded-lg overflow-hidden text-xs">
            {(['all', 'saved', 'unsaved'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1.5 transition-colors ${
                  filter === f
                    ? 'bg-gray-100 text-gray-800 font-medium'
                    : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? 'الكل' : f === 'saved' ? 'محفوظة' : 'غير محفوظة'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-gray-300 py-10 text-sm">جارٍ التحميل...</div>
        ) : (
          <>
            {mode === 'meals' && filteredMeals.length > 0 && filteredMeals.map(p => (
              <SidebarItem
                key={p.sku}
                sku={p.sku}
                name={p.name}
                recipe={recipes[p.sku] || null}
                selected={selectedSku === p.sku}
                onClick={() => onSelect(p)}
              />
            ))}
            {mode === 'batches' && filteredBatches.length > 0 && filteredBatches.map(b => (
              <SidebarItem
                key={b.sku}
                sku={b.sku}
                name={b.name}
                recipe={recipes[b.sku] || null}
                selected={selectedSku === b.sku}
                onClick={() => handleBatchSelect(b)}
              />
            ))}
            {listCount === 0 && (
              <div className="text-center text-gray-300 py-10 text-sm">لا توجد نتائج</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function fcColor(pct: number | null): string {
  if (pct == null) return 'text-gray-400'
  if (pct <= FC_TARGET) return 'text-green-600'
  if (pct <= 45) return 'text-amber-600'
  return 'text-red-600'
}

function SidebarItem({
  sku,
  name,
  recipe,
  selected,
  onClick,
}: {
  sku: string
  name: string
  recipe: Recipe | null
  selected: boolean
  onClick: () => void
}) {
  const diPct = recipe?.food_cost_pct ?? null
  const doPct = recipe?.dine_out_food_cost_pct ?? null
  const hasBothPct = diPct != null && doPct != null && doPct > 0

  return (
    <button
      onClick={onClick}
      className={`w-full text-right px-4 py-3 flex items-center justify-between gap-3 transition-colors border-b border-gray-50 ${
        selected ? 'bg-gray-50' : 'hover:bg-gray-50/70'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate leading-snug ${selected ? 'text-gray-900 font-semibold' : 'text-gray-700'}`}>
          {name}
        </div>
        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{sku}</div>
      </div>
      <div className="flex-shrink-0">
        {hasBothPct ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-[11px] font-mono leading-none ${fcColor(diPct)}`}>
              {diPct!.toFixed(1)}%
            </span>
            <span className={`text-[11px] font-mono leading-none ${fcColor(doPct)}`}>
              {doPct!.toFixed(1)}%
            </span>
          </div>
        ) : diPct != null ? (
          <span className={`text-xs font-mono ${fcColor(diPct)}`}>
            {diPct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>
      {selected && <div className="w-0.5 h-8 bg-gray-800 rounded-full flex-shrink-0 -mr-4 ml-1" />}
    </button>
  )
}

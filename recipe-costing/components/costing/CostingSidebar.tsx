'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import { FC_TARGET } from '@/lib/calculations'
import { qc, cacheKey } from '@/lib/queryCache'
import type { Product, BatchProduct, Recipe } from '@/types'

interface Props {
  selectedSku: string | null
  onSelect: (p: Product) => void
  mode: 'meals' | 'batches'
}

type Filter = 'all' | 'saved' | 'unsaved'

export default function CostingSidebar({ selectedSku, onSelect, mode }: Props) {
  const { brand } = useBrandStore()
  const { isManagement } = useUserStore()
  const isMgmt = isManagement()
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<BatchProduct[]>([])
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>(isMgmt ? 'saved' : 'all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (force = false) => {
    const rk = cacheKey.recipes(brand)
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
        cachedRecs ? Promise.resolve({ data: cachedRecs }) : supabase.from('recipes').select('*').eq('brand_id', brand),
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
        cachedRecs ? Promise.resolve({ data: cachedRecs }) : supabase.from('recipes').select('*').eq('brand_id', brand),
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

  const filteredMeals   = applyFilter(products.filter(p => p.category === 'Meal'))
  const filteredBatches = applyFilter(batches)

  const listCount  = mode === 'meals' ? filteredMeals.length : filteredBatches.length
  const savedCount = mode === 'meals'
    ? products.filter(p => !!recipes[p.sku]).length
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
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 space-y-2">
        {/* Mode toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <Link
            href="/costing"
            className={`flex-1 text-center text-xs py-1.5 rounded-md font-medium transition-colors ${
              mode === 'meals' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🍽 منتجات
          </Link>
          <Link
            href="/costing/batches"
            className={`flex-1 text-center text-xs py-1.5 rounded-md font-medium transition-colors ${
              mode === 'batches' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ⚙ باتش
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium">
            {savedCount} وصفة محفوظة
          </span>
          {overTarget > 0 && (
            <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
              ⚠ {overTarget} فوق {FC_TARGET}%
            </span>
          )}
        </div>
        {!isMgmt && mode === 'meals' && (
          <Link
            href="/costing/import"
            className="flex items-center justify-center gap-1.5 w-full text-xs font-medium py-1.5 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            ⬆ استيراد وصفات
          </Link>
        )}
        <input
          type="text"
          placeholder="بحث..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-400"
        />
        {/* Filter tabs — hidden for management (always shows saved only) */}
        {!isMgmt && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['all', 'saved', 'unsaved'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 text-xs py-1 rounded-md transition-colors ${
                  filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
          <div className="text-center text-gray-400 py-8 text-sm">جارٍ التحميل...</div>
        ) : (
          <>
            {mode === 'meals' && filteredMeals.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-xs text-gray-400 font-semibold uppercase tracking-wider bg-gray-50 sticky top-0 border-b border-gray-100">
                  🍽 منتجات ({filteredMeals.length})
                </div>
                {filteredMeals.map(p => (
                  <SidebarItem
                    key={p.sku}
                    sku={p.sku}
                    name={p.name}
                    recipe={recipes[p.sku] || null}
                    selected={selectedSku === p.sku}
                    onClick={() => onSelect(p)}
                  />
                ))}
              </div>
            )}
            {mode === 'batches' && filteredBatches.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-xs text-gray-400 font-semibold uppercase tracking-wider bg-gray-50 sticky top-0 border-b border-gray-100">
                  ⚙ باتش ({filteredBatches.length})
                </div>
                {filteredBatches.map(b => (
                  <SidebarItem
                    key={b.sku}
                    sku={b.sku}
                    name={b.name}
                    recipe={recipes[b.sku] || null}
                    selected={selectedSku === b.sku}
                    onClick={() => handleBatchSelect(b)}
                  />
                ))}
              </div>
            )}
            {listCount === 0 && (
              <div className="text-center text-gray-400 py-8 text-sm">لا توجد نتائج</div>
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
      className={`w-full text-right px-3 py-2.5 flex items-center justify-between gap-2 transition-colors border-b border-gray-100 ${
        selected
          ? 'bg-blue-50 border-r-2 border-r-blue-500'
          : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate ${selected ? 'text-blue-700 font-medium' : 'text-gray-800'}`}>
          {name}
        </div>
        <div className="text-xs text-gray-400 font-mono">{sku}</div>
      </div>
      <div className="flex-shrink-0 text-left">
        {hasBothPct ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-[11px] font-mono font-bold leading-none ${fcColor(diPct)}`}>
              DI {diPct!.toFixed(1)}%
            </span>
            <span className={`text-[11px] font-mono font-bold leading-none ${fcColor(doPct)}`}>
              DO {doPct!.toFixed(1)}%
            </span>
          </div>
        ) : diPct != null ? (
          <span className={`text-xs font-mono font-bold ${fcColor(diPct)}`}>
            {diPct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>
    </button>
  )
}

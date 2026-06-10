'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/stores/userStore'
import { FC_TARGET } from '@/lib/calculations'
import { qc, cacheKey } from '@/lib/queryCache'
import type { Product, BatchProduct, Recipe, BrandId } from '@/types'

interface Props {
  brand: BrandId
  selectedSku: string | null
  onSelect: (p: Product) => void
  mode: 'meals' | 'batches'
}

type Filter = 'all' | 'saved' | 'unsaved'

export default function CostingSidebar({ brand, selectedSku, onSelect, mode }: Props) {
  const { isManagement } = useUserStore()
  const isMgmt = isManagement()
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<BatchProduct[]>([])
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>(isMgmt ? 'saved' : 'all')
  const [loading, setLoading] = useState(true)

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
          {!isMgmt && (
            <Link
              href={mode === 'meals' ? `/${brand}/costing/import` : `/${brand}/batches/import`}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              استيراد ↑
            </Link>
          )}
        </div>

        {/* Filter tabs — hidden for management */}
        {!isMgmt && (
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

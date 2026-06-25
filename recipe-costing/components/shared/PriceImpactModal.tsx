'use client'
import type { BrandId } from '@/types'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { useUserStore } from '@/stores/userStore'
import { useGlobalLoading } from '@/contexts/globalLoading'
import { calcSuggestedPrice, FC_TARGET, VAT_RATE } from '@/lib/calculations'
import type { PriceChange } from '@/lib/excel'

interface AffectedRecipe {
  id: string
  sku: string
  product_name: string
  sell_price: number
  old_fc_pct: number
  new_fc_pct: number
  delta_fc: number
  suggested_price: number
}

interface Props {
  changes: PriceChange[]
  onClose: () => void
  onApplied: () => void
}

export default function PriceImpactModal({ changes, onClose, onApplied }: Props) {
  const { brand } = useParams() as { brand: BrandId }
  const { profile } = useUserStore()
  const { startLoading, stopLoading, updateProgress } = useGlobalLoading()
  const [affected, setAffected] = useState<AffectedRecipe[]>([])
  const [loadingImpact, setLoadingImpact] = useState(true)
  const [applying, setApplying] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>('button, input, select')
    firstFocusable?.focus()
  }, [])

  useEffect(() => {
    async function loadImpact() {
      setLoadingImpact(true)
      const supabase = createClient()
      const skus = changes.map(c => c.sku)
      const newCostMap = new Map(changes.map(c => [c.sku, c]))

      // Fetch recipe_ingredients for affected SKUs, joined with recipe details
      const { data } = await (supabase.from('recipe_ingredients') as any)
        .select('recipe_id, ing_sku, qty, yield_pct, unit_cost, service_type, recipes!inner(id, sku, product_name, food_cost_pct, total_cost, sell_price, yield_portions, brand_id, is_active)')
        .eq('recipes.brand_id', brand as string)
        .eq('recipes.is_active', true)
        .in('ing_sku', skus)

      // Group by recipe_id
      const recipeMap = new Map<string, { recipe: any; changedIngs: any[] }>()
      for (const row of ((data as any[]) || [])) {
        const r = row.recipes
        if (!r) continue
        if (!recipeMap.has(row.recipe_id)) {
          recipeMap.set(row.recipe_id, { recipe: r, changedIngs: [] })
        }
        recipeMap.get(row.recipe_id)!.changedIngs.push(row)
      }

      const result: AffectedRecipe[] = []
      for (const [, { recipe, changedIngs }] of recipeMap) {
        // Additional cost from price changes (exclude dine_out packaging rows)
        let additionalCost = 0
        for (const ing of changedIngs) {
          if (ing.service_type === 'dine_out') continue
          const yp = ing.yield_pct > 0 ? ing.yield_pct : 100
          const change = newCostMap.get(ing.ing_sku)
          if (change) {
            additionalCost += (ing.qty / (yp / 100)) * (change.newCost - change.oldCost)
          }
        }

        const portions     = Math.max(recipe.yield_portions ?? 1, 1)
        const newTotalCost = (recipe.total_cost ?? 0) + additionalCost
        const newPerPortion = newTotalCost / portions
        const sellExVat    = (recipe.sell_price ?? 0) / VAT_RATE
        const newFcPct     = sellExVat > 0 ? (newPerPortion / sellExVat) * 100 : 0
        // Suggested sell price (ex-VAT) to hit FC_TARGET, then add VAT
        const suggestedPrice = calcSuggestedPrice(newPerPortion, FC_TARGET) * VAT_RATE

        result.push({
          id:            recipe.id,
          sku:           recipe.sku,
          product_name:  recipe.product_name,
          sell_price:    recipe.sell_price ?? 0,
          old_fc_pct:    Math.round((recipe.food_cost_pct ?? 0) * 10) / 10,
          new_fc_pct:    Math.round(newFcPct * 10) / 10,
          delta_fc:      Math.round((newFcPct - (recipe.food_cost_pct ?? 0)) * 10) / 10,
          suggested_price: Math.round(suggestedPrice * 100) / 100,
        })
      }

      // Sort: most impacted first
      result.sort((a, b) => b.delta_fc - a.delta_fc)
      setAffected(result)
      setLoadingImpact(false)
    }
    loadImpact()
  }, [changes, brand])

  async function handleApply() {
    setApplying(true)
    setError(null)
    setProgress({ current: 0, total: changes.length })
    startLoading('جارٍ تطبيق الأسعار...')
    let applied = 0
    try {
      const supabase = createClient()
      const now = new Date().toISOString()
      const yearMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

      for (const change of changes) {
        await (supabase.from('ingredients') as any)
          .update({ cost: change.newCost })
          .eq('sku', change.sku)
          .eq('brand_id', brand as string)

        await (supabase.from('price_history') as any).insert({
          brand_id: brand as string,
          sku: change.sku,
          item_name: change.name,
          item_type: 'ingredient',
          old_price: change.oldCost,
          new_price: change.newCost,
          changed_by: profile?.id ?? null,
          changed_at: now,
        })

        const { data: existing } = await (supabase.from('price_monthly_avg') as any)
          .select('avg_cost, entry_count')
          .eq('brand_id', brand as string)
          .eq('sku', change.sku)
          .eq('year_month', yearMonth)
          .maybeSingle()
        const oldCount: number = existing?.entry_count ?? 0
        const newCount = oldCount + 1
        const newAvg = oldCount > 0
          ? (existing.avg_cost * oldCount + change.newCost) / newCount
          : change.newCost
        await (supabase.from('price_monthly_avg') as any).upsert(
          {
            brand_id: brand as string,
            sku: change.sku,
            item_name: change.name,
            unit: change.unit,
            year_month: yearMonth,
            avg_cost: newAvg,
            entry_count: newCount,
            source: 'manual',
            updated_at: now,
          },
          { onConflict: 'brand_id,sku,year_month' },
        )
        applied++
        setProgress({ current: applied, total: changes.length })
        updateProgress(applied, changes.length)
      }

      await (supabase.from('audit_logs') as any).insert({
        brand_id: brand as string,
        action: 'bulk_price_update',
        entity_type: 'ingredient',
        performed_by: profile?.id ?? null,
        metadata: { count: changes.length, affected_recipes: affected.length },
      })

      onApplied()
      onClose()
    } catch (e: any) {
      const partialMsg = applied > 0 && applied < changes.length
        ? `تم تطبيق ${applied} من ${changes.length} — الباقي لم يُطبَّق`
        : (e.message ?? 'حدث خطأ أثناء التطبيق')
      setError(partialMsg)
    } finally {
      setApplying(false)
      setProgress(null)
      stopLoading()
    }
  }

  const overTarget = affected.filter(r => r.new_fc_pct > FC_TARGET)
  const hasImpact  = affected.some(r => r.delta_fc !== 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div ref={modalRef} className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">تأثير تغيير الأسعار</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {changes.length} مادة خام · {loadingImpact ? '...' : `${affected.length} وصفة ستتأثر`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl p-1">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Alert banner: recipes exceeding FC_TARGET */}
          {!loadingImpact && overTarget.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-700 text-sm font-semibold">
                ⚠️ {overTarget.length} وصفة ستتجاوز هدف الـ FC% ({FC_TARGET}%) بعد هذا التغيير
              </p>
              <p className="text-red-600 text-xs mt-0.5">راجع السعر المقترح لكل وصفة في القائمة أدناه</p>
            </div>
          )}

          {/* Changes list */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              التغييرات ({changes.length})
            </h3>
            <div className="space-y-1">
              {changes.map(c => (
                <div
                  key={c.sku}
                  className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">{c.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{c.sku} · {c.unit}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-xs font-mono">
                    <span className="text-gray-500">{c.oldCost.toFixed(4)}</span>
                    <span className="text-gray-400">→</span>
                    <span className={c.delta > 0 ? 'text-red-600' : 'text-green-600'}>
                      {c.newCost.toFixed(4)}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      c.delta > 0 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-600 border border-green-200'
                    }`}>
                      {c.delta > 0 ? '+' : ''}{c.deltaPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Affected recipes with FC% impact */}
          {!loadingImpact && affected.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                تأثير على الوصفات ({affected.length})
              </h3>
              <div className="space-y-1.5">
                {affected.map(r => {
                  const exceedsTarget = r.new_fc_pct > FC_TARGET
                  return (
                    <div
                      key={r.sku}
                      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border ${
                        exceedsTarget
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate font-medium">{r.product_name}</div>
                        {exceedsTarget && (
                          <div className="text-xs text-red-600 mt-0.5 font-mono">
                            السعر المقترح: {r.suggested_price.toFixed(2)} ر.س
                            <span className="text-red-400 mr-1">(شامل VAT)</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 text-xs font-mono">
                        <span className="text-gray-500">{r.old_fc_pct.toFixed(1)}%</span>
                        <span className="text-gray-400">→</span>
                        <span className={exceedsTarget ? 'text-red-600 font-bold' : 'text-gray-700'}>
                          {r.new_fc_pct.toFixed(1)}%
                        </span>
                        {r.delta_fc !== 0 && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                            r.delta_fc > 0
                              ? 'bg-red-50 text-red-600 border border-red-200'
                              : 'bg-green-50 text-green-600 border border-green-200'
                          }`}>
                            {r.delta_fc > 0 ? '▲' : '▼'}{Math.abs(r.delta_fc).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {loadingImpact && (
            <p className="text-gray-400 text-sm text-center py-4">جارٍ تحليل التأثير...</p>
          )}

          {!loadingImpact && !hasImpact && affected.length > 0 && (
            <p className="text-gray-400 text-xs text-center">لا تأثير على FC% للوصفات المتأثرة</p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 space-y-3">
          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>جارٍ التطبيق...</span>
                <span className="font-mono">{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {overTarget.length > 0
                ? `${overTarget.length} وصفة تحتاج مراجعة السعر بعد التطبيق`
                : 'بعد التطبيق، ستُحدَّث تكاليف الوصفات تلقائياً'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleApply}
                disabled={applying || loadingImpact}
                className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {applying && progress
                  ? `جارٍ التطبيق... ${progress.current} / ${progress.total}`
                  : `تطبيق ${changes.length} تغيير`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

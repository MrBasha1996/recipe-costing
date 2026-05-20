'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBrandStore } from '@/stores/brandStore'
import { useUserStore } from '@/stores/userStore'
import type { PriceChange } from '@/lib/excel'

interface AffectedRecipe {
  sku: string
  product_name: string
  food_cost_pct: number
}

interface Props {
  changes: PriceChange[]
  onClose: () => void
  onApplied: () => void
}

export default function PriceImpactModal({ changes, onClose, onApplied }: Props) {
  const { brand } = useBrandStore()
  const { profile } = useUserStore()
  const [affected, setAffected] = useState<AffectedRecipe[]>([])
  const [loadingImpact, setLoadingImpact] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadImpact() {
      setLoadingImpact(true)
      const supabase = createClient()
      const skus = changes.map(c => c.sku)

      const { data } = await (supabase.from('recipe_ingredients') as any)
        .select('recipe_id, recipes!inner(sku, product_name, food_cost_pct, brand_id)')
        .eq('recipes.brand_id', brand as string)
        .in('ing_sku', skus)

      const seen = new Set<string>()
      const unique: AffectedRecipe[] = []
      ;((data as any[]) || []).forEach((row: any) => {
        const r = row.recipes
        if (r && !seen.has(r.sku)) {
          seen.add(r.sku)
          unique.push({ sku: r.sku, product_name: r.product_name, food_cost_pct: r.food_cost_pct })
        }
      })
      setAffected(unique)
      setLoadingImpact(false)
    }
    loadImpact()
  }, [changes, brand])

  async function handleApply() {
    setApplying(true)
    setError(null)
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

        // Upsert monthly average (running weighted avg)
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
      setError(e.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
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

          {/* Affected recipes */}
          {!loadingImpact && affected.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                وصفات ستتأثر ({affected.length}) — يُنصح بإعادة حسابها بعد التطبيق
              </h3>
              <div className="grid grid-cols-2 gap-1">
                {affected.map(r => (
                  <div key={r.sku} className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-xs">
                    <span className="text-gray-700 truncate block">{r.product_name}</span>
                    <span className="text-gray-500 font-mono">{r.food_cost_pct.toFixed(1)}% حالياً</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingImpact && (
            <p className="text-gray-400 text-sm text-center py-4">جارٍ تحليل التأثير...</p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            بعد التطبيق، افتح كل وصفة متأثرة وأعد حفظها لتحديث FC%
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
              {applying ? 'جارٍ التطبيق...' : `تطبيق ${changes.length} تغيير`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

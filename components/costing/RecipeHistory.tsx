'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AuditLog, PriceHistory, BrandId } from '@/types'

type RecipeSaveEntry = {
  kind: 'save'
  date: string
  diPct: number | null
  doPct: number | null
  savedBy: string | null
  entityName: string | null
}

type PriceChangeEntry = {
  kind: 'price'
  date: string
  ingName: string
  oldPrice: number
  newPrice: number
}

type Entry = RecipeSaveEntry | PriceChangeEntry

interface Props {
  open: boolean
  onClose: () => void
  sku: string
  brand: BrandId
  ingSkus: string[]
}

export default function RecipeHistory({ open, onClose, sku, brand, ingSkus }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    async function load() {
      setLoading(true)
      const supabase = createClient()

      const [{ data: logs }, { data: prices }] = await Promise.all([
        (supabase.from('audit_logs') as any)
          .select('*')
          .eq('entity_type', 'recipe')
          .eq('entity_sku', sku)
          .eq('brand_id', brand)
          .order('created_at', { ascending: false })
          .limit(50),

        ingSkus.length > 0
          ? (supabase.from('price_history') as any)
              .select('*')
              .eq('brand_id', brand)
              .in('sku', ingSkus)
              .order('changed_at', { ascending: false })
              .limit(100)
          : Promise.resolve({ data: [] }),
      ])

      const saveEntries: RecipeSaveEntry[] = ((logs || []) as AuditLog[]).map(l => ({
        kind: 'save',
        date: l.created_at,
        diPct: (l.metadata as any)?.di_food_cost_pct ?? null,
        doPct: (l.metadata as any)?.do_food_cost_pct ?? null,
        savedBy: null,
        entityName: l.entity_name,
      }))

      const priceEntries: PriceChangeEntry[] = ((prices || []) as PriceHistory[]).map(p => ({
        kind: 'price',
        date: p.changed_at,
        ingName: p.item_name,
        oldPrice: p.old_price,
        newPrice: p.new_price,
      }))

      const all: Entry[] = [...saveEntries, ...priceEntries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      setEntries(all)
      setLoading(false)
    }

    load()
  }, [open, sku, brand, ingSkus])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-80 bg-white border-l border-gray-200 z-50 flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">سجل التكلفة</h3>
            <p className="text-xs text-gray-500 mt-0.5">{sku}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
              جارٍ التحميل...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
              لا يوجد سجل بعد
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute right-[11px] top-2 bottom-2 w-px bg-gray-200" />

              <div className="space-y-4">
                {entries.map((entry, i) => (
                  <div key={i} className="flex gap-3 relative">
                    {/* Dot */}
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs z-10 ${
                      entry.kind === 'save'
                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                        : 'bg-amber-50 text-amber-600 border border-amber-200'
                    }`}>
                      {entry.kind === 'save' ? '📋' : '💰'}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="text-xs text-gray-500 mb-1">
                        {new Date(entry.date).toLocaleDateString('ar-SA', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                        <span className="mr-2 text-gray-700">
                          {new Date(entry.date).toLocaleTimeString('ar-SA', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {entry.kind === 'save' ? (
                        <SaveEntry entry={entry} />
                      ) : (
                        <PriceEntry entry={entry} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SaveEntry({ entry }: { entry: RecipeSaveEntry }) {
  return (
    <div className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
      <div className="text-xs font-medium text-gray-800 mb-1">حُفظت الوصفة</div>
      <div className="flex gap-3 text-xs">
        {entry.diPct != null && (
          <span className={fcClass(entry.diPct)}>
            DI: {entry.diPct.toFixed(1)}%
          </span>
        )}
        {entry.doPct != null && (
          <span className={fcClass(entry.doPct)}>
            DO: {entry.doPct.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}

function PriceEntry({ entry }: { entry: PriceChangeEntry }) {
  const pct = entry.oldPrice > 0
    ? ((entry.newPrice - entry.oldPrice) / entry.oldPrice) * 100
    : 0
  const up = pct > 0

  return (
    <div className="bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
      <div className="text-xs font-medium text-gray-800 mb-1 truncate" title={entry.ingName}>
        {entry.ingName}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400 font-mono">{entry.oldPrice.toFixed(3)}</span>
        <span className="text-gray-400">←</span>
        <span className="text-gray-900 font-mono font-bold">{entry.newPrice.toFixed(3)}</span>
        <span className={`font-medium ${up ? 'text-red-600' : 'text-green-600'}`}>
          {up ? '+' : ''}{pct.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

function fcClass(pct: number): string {
  if (pct <= 35) return 'text-green-600'
  if (pct <= 45) return 'text-amber-600'
  return 'text-red-600'
}

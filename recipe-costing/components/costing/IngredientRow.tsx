'use client'

import { calcRowCost } from '@/lib/calculations'
import type { RecipeRowDraft } from '@/types'

interface Props {
  row: RecipeRowDraft
  onChange: (updates: Partial<RecipeRowDraft>) => void
  onDelete: () => void
  canEdit: boolean
  canSeePrices: boolean
}

export default function IngredientRow({ row, onChange, onDelete, canSeePrices, canEdit }: Props) {
  const lineCost = calcRowCost(row.qty, row.yield_pct, row.unit_cost)

  return (
    <div className="flex items-center gap-0 px-4 py-0 border-b border-gray-100 group hover:bg-gray-50 transition-colors">

      {/* Name + badges */}
      <div className="flex-1 min-w-0 py-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm text-gray-800 truncate">{row.ing_name}</span>
          {row.is_semi && (
            <span className="flex-shrink-0 text-xs bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-full leading-none">
              ⚙
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{row.ing_sku}</div>
      </div>

      {/* Qty */}
      <div className="w-20 py-2.5 flex flex-col items-center gap-0.5">
        <input
          type="number"
          value={row.qty}
          onChange={e => onChange({ qty: parseFloat(e.target.value) || 0 })}
          disabled={!canEdit}
          className="w-16 bg-white border border-gray-300 rounded-md px-1.5 py-1 text-xs text-gray-900 text-center focus:outline-none focus:border-blue-500 disabled:opacity-40 transition-colors"
          min={0}
          step={0.001}
        />
        <span className="text-xs text-gray-400">{row.unit}</span>
      </div>

      {/* Yield% */}
      <div className="w-16 py-2.5 flex flex-col items-center gap-0.5">
        <input
          type="number"
          value={row.yield_pct}
          onChange={e => onChange({ yield_pct: Math.max(1, parseFloat(e.target.value) || 100) })}
          disabled={!canEdit || row.is_semi}
          className="w-12 bg-white border border-gray-300 rounded-md px-1.5 py-1 text-xs text-gray-900 text-center focus:outline-none focus:border-blue-500 disabled:opacity-40 transition-colors"
          min={1}
          max={200}
        />
        <span className="text-xs text-gray-400">%</span>
      </div>

      {/* Unit cost */}
      {canSeePrices && (
        <div className="w-24 py-2.5 flex flex-col items-center gap-0.5">
          <input
            type="number"
            value={row.unit_cost}
            onChange={e => onChange({ unit_cost: parseFloat(e.target.value) || 0 })}
            disabled={!canEdit || row.is_semi}
            className="w-20 bg-white border border-gray-300 rounded-md px-1.5 py-1 text-xs text-gray-900 text-center focus:outline-none focus:border-blue-500 disabled:opacity-40 transition-colors"
            min={0}
            step={0.0001}
          />
          <span className="text-xs text-gray-400">ر.س</span>
        </div>
      )}

      {/* Line cost */}
      {canSeePrices && (
        <div className="w-20 py-2.5 ps-2">
          <div className="text-sm font-bold font-mono text-amber-600 text-end">
            {lineCost.toFixed(3)}
          </div>
          <div className="text-xs text-gray-400 text-end">ر.س</div>
        </div>
      )}

      {/* Delete */}
      <div className="w-6 flex items-center justify-center py-2.5">
        {canEdit && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
            title="حذف"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

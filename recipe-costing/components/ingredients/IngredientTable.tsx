'use client'

import type { Ingredient, UnitConversion } from '@/types'

interface Props {
  ingredients: Ingredient[]
  conversions: Map<string, UnitConversion>
  canEdit: boolean
  canSeePrices: boolean
  onEdit: (i: Ingredient) => void
  onDelete: (i: Ingredient) => void
}

export default function IngredientTable({ ingredients, conversions, canEdit, canSeePrices, onEdit, onDelete }: Props) {
  const groups = ingredients.reduce<Record<string, Ingredient[]>>((acc, i) => {
    if (!acc[i.category]) acc[i.category] = []
    acc[i.category].push(i)
    return acc
  }, {})

  if (ingredients.length === 0) {
    return <div className="text-center text-gray-400 py-16">لا توجد مواد خام</div>
  }

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
            {category} ({items.length})
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table suppressHydrationWarning className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-xs bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium">الاسم</th>
                  <th className="text-right px-4 py-3 font-medium">SKU</th>
                  <th className="text-center px-4 py-3 font-medium">وحدة الوصفة</th>
                  <th className="text-center px-4 py-3 font-medium">وحدة الشراء</th>
                  {canSeePrices && (
                    <th className="text-center px-4 py-3 font-medium">التكلفة / وحدة</th>
                  )}
                  {canEdit && <th className="px-4 py-3 w-24" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(i => (
                  <tr key={i.sku} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900">{i.name}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{i.sku}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{i.unit}</td>
                    <td className="px-4 py-3 text-center">
                      {conversions.has(i.sku) ? (
                        <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                          {conversions.get(i.sku)!.buy_unit}
                          <span className="text-xs text-gray-400 font-mono">
                            ×{conversions.get(i.sku)!.factor}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {canSeePrices && (
                      <td className="px-4 py-3 text-center font-mono">
                        {i.cost > 0 ? (
                          <span className="text-green-600">{i.cost.toFixed(6)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onEdit(i)}
                            className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                          >
                            تعديل
                          </button>
                          {!i.is_base && (
                            <button
                              onClick={() => onDelete(i)}
                              className="text-xs px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                            >
                              حذف
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

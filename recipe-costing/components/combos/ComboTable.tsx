import type { ComboMeal } from '@/types'

interface Props {
  combos: ComboMeal[]
  canEdit: boolean
  canSeePrices: boolean
  onEdit: (c: ComboMeal) => void
  onDelete: (c: ComboMeal) => void
}

export default function ComboTable({ combos, canEdit, canSeePrices, onEdit, onDelete }: Props) {
  if (combos.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-14 text-center text-gray-400 text-sm">
        لا توجد وجبات كومبو بعد
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
            <th className="text-right px-4 py-3 font-medium">الاسم</th>
            <th className="text-right px-4 py-3 font-medium">SKU</th>
            <th className="text-center px-4 py-3 font-medium">المنتجات</th>
            {canSeePrices && (
              <>
                <th className="text-center px-4 py-3 font-medium">التكلفة</th>
                <th className="text-center px-4 py-3 font-medium">سعر البيع</th>
                <th className="text-center px-4 py-3 font-medium">سعر التطبيق</th>
                <th className="text-center px-4 py-3 font-medium">نسبة التكلفة</th>
                <th className="text-center px-4 py-3 font-medium">الهامش</th>
              </>
            )}
            {canEdit && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {combos.map((c, i) => {
            const itemCount = c.combo_meal_items?.length ?? 0
            const fcColor =
              c.food_cost_pct > 35 ? 'text-red-600' :
              c.food_cost_pct > 28 ? 'text-amber-600' :
              'text-green-600'

            return (
              <tr
                key={c.id}
                className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{c.name}</div>
                  {!c.is_active && (
                    <span className="text-xs text-gray-400">غير نشط</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.sku}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                    {itemCount} {itemCount === 1 ? 'منتج' : 'منتجات'}
                  </span>
                </td>
                {canSeePrices && (
                  <>
                    <td className="px-4 py-3 text-center font-mono text-gray-700">
                      {c.total_cost.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-semibold text-gray-900">
                      {c.price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-gray-600">
                      {c.app_price != null ? c.app_price.toFixed(2) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-center font-mono font-semibold ${fcColor}`}>
                      {c.price > 0 ? `${c.food_cost_pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-emerald-700 font-semibold">
                      {c.price > 0 ? c.margin.toFixed(2) : '—'}
                    </td>
                  </>
                )}
                {canEdit && (
                  <td className="px-4 py-3 text-left">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => onEdit(c)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => onDelete(c)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

import { FC_TARGET } from '@/lib/calculations'
import type { Recipe } from '@/types'

interface Props {
  recipes: Recipe[]
}

export default function OverTargetTable({ recipes }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">وصفات فوق الهدف ({FC_TARGET}%)</h3>
        <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
          {recipes.length} وصفة
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
              <th className="text-right px-4 py-2 font-medium">المنتج</th>
              <th className="text-center px-3 py-2 font-medium">Food Cost %</th>
              <th className="text-center px-3 py-2 font-medium">تكلفة الحصة</th>
              <th className="text-center px-3 py-2 font-medium">سعر البيع</th>
              <th className="text-center px-3 py-2 font-medium">هامش الربح</th>
              <th className="text-center px-3 py-2 font-medium">الزيادة عن الهدف</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map(r => {
              const excess = r.food_cost_pct - FC_TARGET
              const fcColor = r.food_cost_pct <= 45 ? 'text-amber-600' : 'text-red-600'
              const perPortion = r.yield_portions > 0 ? r.total_cost / r.yield_portions : r.total_cost
              return (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="text-gray-800">{r.product_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{r.sku}</div>
                  </td>
                  <td className="text-center px-3 py-2.5">
                    <span className={`font-mono font-bold ${fcColor}`}>
                      {r.food_cost_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-center px-3 py-2.5 font-mono text-amber-600">
                    {perPortion.toFixed(3)}
                  </td>
                  <td className="text-center px-3 py-2.5 font-mono text-gray-700">
                    {r.sell_price.toFixed(2)}
                  </td>
                  <td className="text-center px-3 py-2.5 font-mono">
                    <span className={r.margin >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {r.margin.toFixed(2)}
                    </span>
                  </td>
                  <td className="text-center px-3 py-2.5">
                    <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-mono">
                      +{excess.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

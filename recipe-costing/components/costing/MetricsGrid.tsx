import { fmt, FC_TARGET } from '@/lib/calculations'
import type { FoodCostResult } from '@/types'

interface Props {
  result: FoodCostResult
  showPrices: boolean
}

export default function MetricsGrid({ result, showPrices }: Props) {
  const fcColor =
    result.foodCostPct <= FC_TARGET ? 'text-green-600' :
    result.foodCostPct <= 45 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className={`grid gap-2 ${showPrices ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
      <MetricCard label="إجمالي التكلفة" value={`${fmt(result.totalCost)} ر.س`} color="text-gray-900" />
      <MetricCard label="تكلفة الحصة" value={`${fmt(result.perPortionCost)} ر.س`} color="text-amber-600" />
      <MetricCard label="Food Cost %" value={`${result.foodCostPct.toFixed(1)}%`} color={fcColor} />
      {showPrices && (
        <MetricCard
          label="هامش الربح"
          value={`${fmt(result.margin)} ر.س`}
          sub={result.marginApp != null ? `App: ${fmt(result.marginApp)} ر.س` : undefined}
          color={result.margin >= 0 ? 'text-green-600' : 'text-red-600'}
        />
      )}
    </div>
  )
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <div className={`text-base font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
